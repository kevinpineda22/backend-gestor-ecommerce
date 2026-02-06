import { getWooProducts, getWooPricesByIds } from "./woo.service.js";
import supabase from "../supabaseClient.js";
import wooApi from "./woo.service.js";
import { getLivePriceForItem } from "./siesa/siesa.prices.js";
import { getLiveStockForItem } from "./siesa/siesa.stock.js";

export async function debugSkuStatus(sku) {
  const report = {
    checked_sku: sku,
    siesa: null,
    supabase_map: null,
    woocommerce: null,
    conclusion: "Analizando..."
  };

  // 1. Check SIESA
  const { data: siesaItems } = await supabase
    .from("items_siesa")
    .select("*")
    .ilike("f120_id", `%${sku}%`); // Busqueda laxa para ver parecidos

  // Encontrar exacto
  const exactSiesa = siesaItems?.find(i => String(i.f120_id).trim() === sku.trim());
  
  report.siesa = { 
    found_exact: Boolean(exactSiesa), 
    candidates: siesaItems?.map(i => `[${i.f120_id}] len=${i.f120_id.length}`) || []
  };

  // 2. Check Supabase Map
  const { data: mapItem } = await supabase
    .from("ecommerce_products")
    .select("*")
    .eq("item", sku)
    .maybeSingle();

  report.supabase_map = mapItem || "NO ENTRY FOUND";

  // 3. Check WooCommerce Direct
  try {
    const wooRes = await wooApi.get("/products", {
      params: { sku: sku }
    });
    
    if (wooRes.data.length > 0) {
      const p = wooRes.data[0];
      report.woocommerce = {
        id: p.id,
        sku_raw: `[${p.sku}]`,
        status: p.status,
        name: p.name
      };
    } else {
      report.woocommerce = "NOT FOUND IN WOO BY EXACT SKU";
    }
  } catch (e) {
    report.woocommerce = "ERROR FETCHING WOO: " + e.message;
  }

  // 4. Analisis
  if (report.woocommerce?.id && !report.supabase_map?.woo_product_id) {
    report.conclusion = "CRÍTICO: Existe en Woo y Siesa, pero la tabla intermedia (ecommerce_products) NO tiene el registro. Falla de Sincronización.";
  } else if (!report.woocommerce?.id) {
    report.conclusion = "No existe en WooCommerce con ese SKU exacto.";
  } else {
    report.conclusion = "Parece estar vinculado. Verifica espacios vacíos.";
  }

  return report;
}

export async function mapWooWithSupabase() {
  // 1. Productos Woo
  const wooResult = await getWooProducts({ page: 1, perPage: 100 });

  if (!wooResult.ok) {
    return wooResult;
  }

  // 2. Productos activos en SIESA
  const { data: siesaItems, error } = await supabase
    .from("items_siesa")
    .select(`
      f120_id,
      f120_descripcion,
      grupo,
      subgrupo,
      marca,
      activo
    `)
    .eq("activo", true);

  if (error) {
    return {
      ok: false,
      message: "Error leyendo items_siesa",
      error,
    };
  }

  // 3. Mapa Woo por SKU
  const wooMap = new Map(
    wooResult.data.map((p) => [String(p.sku), p])
  );

  const linked = [];
  const onlyWoo = [];
  const onlySupabase = [];

  // 4. SIESA → Woo
  for (const item of siesaItems) {
    const sku = String(item.f120_id);
    const woo = wooMap.get(sku);

    if (woo) {
      linked.push({
        item: sku,
        woo_product_id: woo.woo_product_id,
        name: woo.name,
      });

      // Guardar / actualizar mapeo
      await supabase
        .from("ecommerce_products")
        .upsert({
          item: sku,
          woo_product_id: woo.woo_product_id,
          woo_status: woo.status,
          ecommerce_active: woo.status === "publish",
          last_sync: new Date(),
        });
    } else {
      onlySupabase.push({
        item: sku,
        descripcion: item.f120_descripcion,
        marca: item.marca,
      });
    }
  }

  // 5. Woo → SIESA
  const siesaSet = new Set(
    siesaItems.map((i) => String(i.f120_id))
  );

  for (const woo of wooResult.data) {
    if (!siesaSet.has(String(woo.sku))) {
      onlyWoo.push(woo);
    }
  }

  return {
    ok: true,
    summary: {
      woo_total: wooResult.data.length,
      siesa_total: siesaItems.length,
      linked: linked.length,
      onlyWoo: onlyWoo.length,
      onlySupabase: onlySupabase.length,
    },
    linked,
    onlyWoo,
    onlySupabase,
  };
}

// Helper para traer TODOS los registros sin importar el límite de 1000
async function fetchAllRows(table, select, orderBy = null) {
  let allData = [];
  let page = 0;
  const pageSize = 1000;
  let keepFetching = true;

  while (keepFetching) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = supabase.from(table).select(select).range(from, to);
    if (orderBy) {
      query = query.order(orderBy, { ascending: true });
    }

    const { data, error } = await query;
    
    if (error) throw error;

    if (data.length > 0) {
      allData = allData.concat(data);
      if (data.length < pageSize) keepFetching = false; // Última página
      page++;
    } else {
      keepFetching = false;
    }
  }
  return allData;
}

export async function getCatalog() {
  console.log("📥 Iniciando descarga completa de catálogo...");

  try {
    // 1. Productos SIESA activos (TODOS)
    const siesaItems = await fetchAllRows("items_siesa", "f120_id, f120_descripcion, grupo, subgrupo, marca, activo");
    console.log(`✅ SIESA cargados: ${siesaItems.length}`);

    // 2. Mapeo ecommerce (TODOS)
    // Agregamos 'woo_name' a la selección
    const ecommerceMap = await fetchAllRows("ecommerce_products", "item, woo_product_id, woo_status, ecommerce_active, image_url, woo_name");
    console.log(`✅ Ecommerce Map cargados: ${ecommerceMap.length}`);

    // 3. Crear mapa INTELIGENTE
    const ecommerceByItem = new Map();

    ecommerceMap.forEach((e) => {
      const key = String(e.item).trim().toUpperCase();
      ecommerceByItem.set(key, e);

      const keyNoZeros = key.replace(/^0+/, '');
      if (keyNoZeros.length > 0 && keyNoZeros !== key) {
        if (!ecommerceByItem.has(keyNoZeros)) {
          ecommerceByItem.set(keyNoZeros, e);
        }
      }
    });

    // 4. Unificar
    const catalog = siesaItems.map((item) => {
      const keyRaw = String(item.f120_id).trim();
      const keySearch = keyRaw.toUpperCase();
      
      let ecommerce = ecommerceByItem.get(keySearch);

      if (!ecommerce) {
        const keyNoZeros = keySearch.replace(/^0+/, '');
        if (keyNoZeros.length > 0 && keyNoZeros !== keySearch) {
          ecommerce = ecommerceByItem.get(keyNoZeros);
        }
      }
      
      return {
        item: keyRaw,
        // Prioridad: Nombre Woo > Nombre Siesa
        descripcion: ecommerce?.woo_name || item.f120_descripcion,
        marca: item.marca,
        grupo: item.grupo,
        subgrupo: item.subgrupo,
        exists_in_woo: Boolean(ecommerce),
        woo_product_id: ecommerce?.woo_product_id || null,
        woo_status: ecommerce?.woo_status || null,
        ecommerce_active: ecommerce?.ecommerce_active || false,
        image_url: ecommerce?.image_url || null,
      };
    });
    
    console.log(`🚀 Catálogo unificado generado: ${catalog.length} items`);

    return {
      ok: true,
      total: catalog.length,
      data: catalog,
    };

  } catch (error) {
    console.error("Error en getCatalog:", error);
    return { ok: false, message: "Error cargando catálogo", error };
  }
}

export async function updateProductInWoo(wooId, data) {
  // data: { name, image_url, price, status }
  if (!wooId) throw new Error("ID de Woo requerido");

  const payload = {};
  if (data.name) payload.name = data.name;
  
  if (data.price !== undefined) {
    payload.regular_price = String(data.price);
  }
  
  if (data.stock_quantity !== undefined) {
    payload.stock_quantity = data.stock_quantity;
    payload.manage_stock = true;
  }

  // Manejo de Imágenes (Múltiples)
  if (data.images && Array.isArray(data.images) && data.images.length > 0) {
    // FIX: Filtrar URLs vacías para evitar "woocommerce_product_image_upload_error"
    const validImages = data.images.filter(url => url && typeof url === 'string' && url.trim().length > 0);
    if (validImages.length > 0) {
       payload.images = validImages.map(url => ({ src: url.trim() }));
    }
  } else if (data.image_url && typeof data.image_url === 'string' && data.image_url.trim().length > 0) {
    payload.images = [{ src: data.image_url.trim() }];
  }

  // Manejo de Categorías (Array de IDs)
  if (data.categories && Array.isArray(data.categories)) {
      // Woo espera: categories: [ { id: 10 }, { id: 15 } ]
      payload.categories = data.categories.map(id => ({ id }));
  }

  // Manejo de Etiquetas/Marcas (Array de IDs)
  if (data.tags && Array.isArray(data.tags)) {
      // Woo espera: tags: [ { id: 10 }, { id: 15 } ]
      payload.tags = data.tags.map(id => ({ id }));
  }

  // Manejo de Brands (Taxonomía personalizada)
  if (data.brands && Array.isArray(data.brands)) {
      payload.brands = data.brands.map(id => ({ id }));
  }

  // 1. Update Woo
  try {
    await wooApi.put(`/products/${wooId}`, payload);
  } catch (error) {
    if (error.response && error.response.data) {
      console.error("WooCommerce API Error:", JSON.stringify(error.response.data, null, 2));
      throw new Error(`WooCommerce rechazó la actualización: ${error.response.data.message || error.message}`);
    }
    throw error;
  }

  // 2. Update Local Mirror
  const updateLocal = {};
  if (data.images && data.images.length > 0) updateLocal.image_url = data.images[0];
  else if (data.image_url) updateLocal.image_url = data.image_url;
  if (data.name) updateLocal.woo_name = data.name; // Guardamos el nombre en local
  
  if (typeof data.active === 'boolean') {
    updateLocal.ecommerce_active = data.active;
    updateLocal.woo_status = data.active ? 'publish' : 'draft';
  }

  if (Object.keys(updateLocal).length > 0) {
    updateLocal.last_sync = new Date();
    await supabase.from("ecommerce_products").update(updateLocal).eq("woo_product_id", wooId);
  }

  return { ok: true };
}

export async function createProductInWoo(data) {
  // data: { name, sku, description, price, image_url, categories, tags, brands }
  try {
      // 🚀 SIESA PRE-FETCH: Buscar precio/stock real en PV001 para que nazca vivo
      let initialStock = 0;
      let initialPrice = data.price; // Fallback al del formulario

      try {
          // Hardcodeado PV001 / P01 por solicitud expresa para MVP
          const SEDE_INIT = "PV001";
          const LISTA_INIT = "P01";
          
          console.log(`🔌 Pre-cargando Siesa para ${data.sku} en ${SEDE_INIT}...`);
          
          const [liveStockVal, livePriceVal] = await Promise.all([
             getLiveStockForItem({ item: data.sku, sede: SEDE_INIT }),
             getLivePriceForItem({ item: data.sku, sedeLista: LISTA_INIT })
          ]);

          // Si Siesa responde, usamos esos valores
          // FIX: Siesa devuelve Objetos, extraer valores numéricos
          if (liveStockVal && typeof liveStockVal.disponible === 'number') {
             initialStock = liveStockVal.disponible;
          } else if (liveStockVal && typeof liveStockVal.existencia === 'number') {
             initialStock = liveStockVal.existencia;
          }

          if (livePriceVal && typeof livePriceVal.precio === 'number') {
             initialPrice = livePriceVal.precio;
          }

          console.log(`✅ Siesa respondió: StockObj=${JSON.stringify(liveStockVal)}, PriceObj=${JSON.stringify(livePriceVal)}`);
          console.log(`👉 Usando: Stock=${initialStock}, Price=${initialPrice}`);

      } catch (siesaErr) {
          console.warn("⚠️ Falló lectura Siesa pre-creación, usando defaults:", siesaErr.message);
      }

      const payload = {
          name: data.name,
          type: 'simple',
          status: 'publish', // Publicar por defecto
          catalog_visibility: 'visible', // Forzar visibilidad
          sku: data.sku, 
          description: data.description || '',
          short_description: data.short_description || '',
          manage_stock: true,
          // Si el stock es 0, Woo lo oculta por defecto en muchas configs.
          stock_quantity: initialStock, 
          regular_price: initialPrice ? String(initialPrice) : undefined
      };

      // Imagen
      if (data.images && Array.isArray(data.images) && data.images.length > 0) {
          // FIX: Filtrar URLs vacías
          const validImages = data.images.filter(url => url && typeof url === 'string' && url.trim().length > 0);
          if (validImages.length > 0) {
              payload.images = validImages.map(url => ({ src: url.trim() }));
          }
      } else if (data.image_url && typeof data.image_url === 'string' && data.image_url.trim().length > 0) {
          payload.images = [{ src: data.image_url.trim() }];
      }

      // Categorías
      if (data.categories && Array.isArray(data.categories)) {
          payload.categories = data.categories.map(id => ({ id }));
      }

      // Tags estándar
      if (data.tags && Array.isArray(data.tags)) {
        payload.tags = data.tags.map(id => ({ id }));
      }
      
      // Brands (si el plugin YITH Brands usa taxonomía)
      // Nota: A veces Woo requiere que vengan en atributos o en un campo especial, pero intentamos taxonomía
      // Si marcas son 'pa_brand' o similar, ajuste necesario. Aquí asumimos la estructura estándar
      if (data.brands && Array.isArray(data.brands)) {
           // Algunos plugins usan 'brands' como campo top-level
           payload.brands = data.brands.map(id => ({ id }));
      }

      const response = await wooApi.post("/products", payload);
      const newWooId = response.data.id;
      
      console.log(`✅ Producto creado en Woo: ${newWooId} - ${response.data.name}`);
      
      // REGISTRAR EN SUPABASE PARA VINCULARLO INMEDIATAMENTE
      // Buscamos si ya existe registro por SKU (muy probable que si, viniendo de Siesa)
      const { data: existing } = await supabase.from("ecommerce_products").select("*").eq("item", data.sku).single();
      
      if (existing) {
          // Actualizar registro existente
          await supabase.from("ecommerce_products").update({
              woo_product_id: newWooId,
              woo_status: 'publish',
              ecommerce_active: true,
              last_sync: new Date(),
              image_url: data.image_url || existing.image_url
          }).eq("item", data.sku);
      } else {
          // Crear registro nuevo (Raro si venía del listado del gestor, pero posible)
          await supabase.from("ecommerce_products").insert({
              item: data.sku,
              woo_product_id: newWooId,
              woo_status: 'publish',
              ecommerce_active: true,
              last_sync: new Date(),
              image_url: data.image_url
          });
      }

      return {
          ok: true,
          data: response.data
      };

  } catch (error) {
      console.error("Error creando producto en Woo:", error.response?.data || error.message);
      // Si el error es "SKU ya existe", podríamos intentar recuperar ese ID y vincularlo
      throw error;
  }
}

export async function toggleCatalogItem({ item, active }) {
  const sku = String(item);

  // 1. Buscar en ecommerce_products
  const { data: ecommerce, error: ecommerceError } = await supabase
    .from("ecommerce_products")
    .select("*")
    .eq("item", sku)
    .maybeSingle();

  if (ecommerceError) {
    return {
      ok: false,
      message: "Error leyendo ecommerce_products",
      error: ecommerceError,
    };
  }

  let wooProductId = ecommerce?.woo_product_id;

  // 2. Si NO tenemos woo_product_id, buscar en Woo por SKU
  if (!wooProductId) {
    const wooSearch = await wooApi.get("/products", {
      params: { sku },
    });

    if (wooSearch.data.length > 0) {
      // 🔁 Producto ya existe en Woo
      wooProductId = wooSearch.data[0].id;

      await supabase.from("ecommerce_products").upsert({
        item: sku,
        woo_product_id: wooProductId,
        woo_status: active ? "publish" : "draft",
        ecommerce_active: active,
        last_sync: new Date(),
      });

      // Cambiar estado en Woo
      await wooApi.put(`/products/${wooProductId}`, {
        status: active ? "publish" : "draft",
      });

      return {
        ok: true,
        created: false,
        woo_product_id: wooProductId,
        active,
      };
    }
  }

  // 3. Si NO existe ni en ecommerce_products ni en Woo → crear
  if (!wooProductId) {
    // Obtener datos desde SIESA
    const { data: siesaItem, error: siesaError } = await supabase
      .from("items_siesa")
      .select("f120_descripcion")
      .eq("f120_id", sku)
      .single();

    if (siesaError || !siesaItem) {
      return {
        ok: false,
        message: "Item no encontrado en SIESA",
        error: siesaError,
      };
    }

    // Crear producto en Woo
    const wooResponse = await wooApi.post("/products", {
      name: siesaItem.f120_descripcion,
      sku,
      status: active ? "publish" : "draft",
      manage_stock: true,
      stock_quantity: 0,
    });

    wooProductId = wooResponse.data.id;

    // Guardar mapeo
    await supabase.from("ecommerce_products").insert({
      item: sku,
      woo_product_id: wooProductId,
      woo_status: active ? "publish" : "draft",
      ecommerce_active: active,
      last_sync: new Date(),
    });

    return {
      ok: true,
      created: true,
      woo_product_id: wooProductId,
      active,
    };
  }

  // 4. Caso final: ya existía mapeado → solo cambiar estado
  await wooApi.put(`/products/${wooProductId}`, {
    status: active ? "publish" : "draft",
  });

  await supabase
    .from("ecommerce_products")
    .update({
      woo_status: active ? "publish" : "draft",
      ecommerce_active: active,
      last_sync: new Date(),
    })
    .eq("item", sku);

  return {
    ok: true,
    created: false,
    woo_product_id: wooProductId,
    active,
  };
}

export async function adoptWooProducts() {
  console.log("🚀 Iniciando sincronización completa de productos Woo");

  let page = 1;
  const perPage = 100;
  let totalProcessed = 0;
  let keepGoing = true;

  while (keepGoing) {
    console.log(`📦 Sincronizando Woo página ${page} (todas los estados)...`);

    // Pedimos TODOS los productos (publish, draft, pending, private)
    // OPTIMIZACIÓN: Solo pedimos id, sku, status e imagenes
    const res = await wooApi.get("/products", {
      params: {
        per_page: perPage,
        page,
        _fields: "id,sku,status,images" 
      }
    });

    const wooProducts = res.data;

    if (!wooProducts || wooProducts.length === 0) {
      keepGoing = false;
      break;
    }

      // Preparamos payload para upsert (insertar o actualizar)
    const payload = [];
    let missingSkuCount = 0;

    for (const p of wooProducts) {
      // ⚠️ CRÍTICO: El SKU debe ser idéntico al ID de Siesa.
      // Si no tiene SKU, usamos el ID, pero eso probablemente no vincule con nada en Siesa.
      let itemKey = p.id; 
      if (p.sku) {
        itemKey = String(p.sku).trim(); // Quitamos espacios accidentales
      } else {
        missingSkuCount++;
      }

      payload.push({
        item: String(itemKey),
        woo_product_id: p.id,
        woo_status: p.status,
        ecommerce_active: p.status === "publish",
        image_url: p.images?.[0]?.src || null,
        woo_name: p.name, // Sincronizamos el nombre de Woo
        last_sync: new Date().toISOString()
      });
    }

    if (missingSkuCount > 0) {
      console.warn(`⚠️ Alerta: ${missingSkuCount} productos en esta página NO tienen SKU (Se usó ID, posible error de vínculo).`);
    }

    // UPSERT EN BLOQUE
    // Actualiza estado incluso si ya existe
    const { error: upsertError } = await supabase
      .from("ecommerce_products")
      .upsert(payload, { onConflict: "woo_product_id" });

    if (upsertError) {
      console.error("❌ Error sync batch:", upsertError);
      // No lanzamos error para no detener todo el proceso, solo logueamos
    } else {
      totalProcessed += payload.length;
      console.log(`✅ Sincronizados ${payload.length} items`);
    }

    // Si Woo devolvió menos de 100, ya no hay más
    if (wooProducts.length < perPage) {
      keepGoing = false;
    } else {
      page++;
    }
  }

  console.log("🏁 Sincronización finalizada");
  console.log(`🎉 Total productos procesados: ${totalProcessed}`);

  return {
    ok: true,
    processed: totalProcessed,
    message: "Sincronización con WooCommerce completada"
  };
}

export async function getLiveComparison({ sede, page = 1, limit = 20, item }) {
  // 1️⃣ Mapeo sede → lista
  const SEDE_LISTA = {
    PV001: "P01",
    "00201": "P02",
    "00301": "P03",
    "00401": "P04",
    "00601": "P05",
    "00701": "P06",
    "00801": "P07"
  };

  const lista = SEDE_LISTA[sede] ?? "GRAL";

  // 2️⃣ Query base ecommerce_products
  let query = supabase
    .from("ecommerce_products")
    .select("item, woo_product_id", { count: 'exact' })
    .eq("ecommerce_active", true);

  if (item) {
    query = query.eq("item", String(item));
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data: products, error, count } = await query.range(from, to);

  if (error) {
    throw new Error("Error leyendo ecommerce_products");
  }

  // Si no hay productos, retornar array vacío de una vez
  if (!products || products.length === 0) {
    return { ok: true, data: [] };
  }

  // 1️⃣ Optimización: Traer precios Woo en Batch
  const wooIds = products.map((p) => p.woo_product_id); // Re-declaramos por seguridad
  const wooDataMap = await getWooPricesByIds(wooIds);

  // 2️⃣ Optimización: Requests
  // 🔄 REVERTIDO: Usuario prefiere carga lenta segura en vez de cache rápida masiva compleja.
  // Siempre usamos modo LIVE paginado.
  const USE_CACHE = false; 
  
  /* 
  // CÓDIGO CACHE DESHABILITADO
  if (USE_CACHE) {
     console.log(`🚀 Modo Rápido (Cache) detectado para ${products.length} items.`);
     ...
  } 
  */

  // 🔽 MODO LENTO / LIVE (Pocos items)
  // 🚀 Reducimos drásticamente a 5 para evitar error 429 (Too Many Requests)
  const BATCH_SIZE = 5;
  const results = [];

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    
    // Procesar este lote en paralelo
    const batchResults = await Promise.all(
      batch.map(async (p) => {
        // Fetch en paralelo Siesa Precio + Stock
        const [livePrice, stock] = await Promise.all([
          getLivePriceForItem({ item: p.item, sedeLista: lista }).catch((e) => {
             console.error(`❌ Error precio ${p.item}:`, e.message);
             return null;
          }),
          getLiveStockForItem({ item: p.item, sede }).catch((e) => {
             console.error(`❌ Error stock ${p.item}:`, e.message);
             return null;
          }),
        ]);

        const siesaPrice =
          livePrice && typeof livePrice.precio === "number" && livePrice.precio > 0
            ? livePrice.precio
            : null;

        const wooInfo = wooDataMap[p.woo_product_id] || { price: null, stock: null };
        const wooPrice = wooInfo.price;
        const wooStock = wooInfo.stock;

        let priceStatus = "OK";
        let priceDiff = null;

        if (!siesaPrice) {
          priceStatus = "NO_EXISTE_EN_SIESA";
        } else if (wooPrice === null) {
          priceStatus = "NO_EXISTE_WOO";
        } else {
          priceDiff = siesaPrice - wooPrice;
          if (priceDiff !== 0) {
            priceStatus = "DIFERENTE";
          }
        }

        return {
          item: p.item,
          woo_product_id: p.woo_product_id,
          woo_price: wooPrice,
          woo_stock: wooStock,
          siesa_price: siesaPrice,
          unidad: livePrice?.unidad ?? null,
          price_diff: priceDiff,
          price_status: priceStatus,
          stock_disponible: stock?.disponible ?? 0,
          stock_existencia: stock?.existencia ?? 0,
          stock_comprometido: stock?.pos ?? 0,
        };
      })
    );

    results.push(...batchResults);

    // 🛑 PAUSA entre lotes para dejar respirar a la API de Siesa
    if (i + BATCH_SIZE < products.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return {
    ok: true,
    total: count,
    data: results
  };
}
