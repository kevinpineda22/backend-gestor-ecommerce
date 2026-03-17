import { getWooProducts, getWooPricesByIds, getWooPricesBySkus, getWooClientForSede, getAllSedeWooClients } from "./woo.service.js";
import supabase from "../supabaseClient.js";
import wooApi from "./woo.service.js";
import { getLivePriceForItem } from "./siesa/siesa.prices.js";
import { getLiveStockForItem } from "./siesa/siesa.stock.js";

export async function getCatalogStats() {
    // Ejecutar conteos en paralelo
    const [
        { count: totalCount },
        { count: activeCount },
        { count: draftCount },
        { count: noImageCount } // Productos sin imagen (calidad)
    ] = await Promise.all([
        supabase.from("ecommerce_products").select("*", { count: "exact", head: true }),
        supabase.from("ecommerce_products").select("*", { count: "exact", head: true }).eq("ecommerce_active", true),
        supabase.from("ecommerce_products").select("*", { count: "exact", head: true }).eq("woo_status", "draft"),
        supabase.from("ecommerce_products").select("*", { count: "exact", head: true }).is("image_url", null)
    ]);

    return {
        total_products: totalCount || 0,
        active_products: activeCount || 0,
        draft_products: draftCount || 0,
        missing_images: noImageCount || 0
    };
}


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

// ═══════════════════════════════════════════════════════════════
// CACHÉ EN MEMORIA - Evita re-descargar 22k items en cada request
// ═══════════════════════════════════════════════════════════════
let _catalogCache = null;
let _catalogCacheTime = 0;
let _catalogRefreshing = false; // Flag para evitar refreshes simultáneos
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export function invalidateCatalogCache() {
  _catalogCache = null;
  _catalogCacheTime = 0;
  console.log("🗑️ Caché de catálogo invalidado");
}

// Refresh en background (no bloquea al usuario)
function triggerBackgroundRefresh() {
  if (_catalogRefreshing) return;
  _catalogRefreshing = true;
  console.log("🔄 Refrescando catálogo en background...");
  _buildCatalog().then(catalog => {
    _catalogCache = catalog;
    _catalogCacheTime = Date.now();
    console.log("✅ Catálogo refrescado en background");
  }).catch(err => {
    console.error("❌ Error en background refresh:", err.message);
  }).finally(() => {
    _catalogRefreshing = false;
  });
}

async function getFullCatalog() {
  // STALE-WHILE-REVALIDATE:
  // Si hay caché (aunque sea viejo), servirlo inmediatamente.
  // Si el TTL expiró, disparar refresh en background.
  if (_catalogCache) {
    if ((Date.now() - _catalogCacheTime) >= CACHE_TTL_MS) {
      triggerBackgroundRefresh();
    }
    return _catalogCache;
  }

  // Cold start: no hay caché, hay que esperar
  const catalog = await _buildCatalog();
  _catalogCache = catalog;
  _catalogCacheTime = Date.now();
  return catalog;
}

async function _buildCatalog() {
  console.log("📥 Descargando catálogo completo...");
  const start = Date.now();

  try {
    // PARALELO: Descargar ambas tablas al mismo tiempo
    const [siesaItems, ecommerceMap] = await Promise.all([
      fetchAllRows("items_siesa", "f120_id, f120_descripcion, grupo, subgrupo, marca, activo"),
      fetchAllRows("ecommerce_products", "item, woo_product_id, woo_status, ecommerce_active, active_sedes, image_url, woo_name, woo_category_names, woo_tag_names")
    ]);
    console.log(`✅ SIESA: ${siesaItems.length} | Ecommerce: ${ecommerceMap.length} (${Date.now() - start}ms)`);

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
        exists_in_woo: Boolean(ecommerce?.woo_product_id),
        woo_product_id: ecommerce?.woo_product_id || null,
        woo_status: ecommerce?.woo_status || null,
        ecommerce_active: ecommerce?.ecommerce_active || false,
        active_sedes: ecommerce?.active_sedes || {},
        image_url: ecommerce?.image_url || null,
        // Campos Cache Directos para visualización instantánea
        woo_category_names: ecommerce?.woo_category_names || null,
        woo_tag_names: ecommerce?.woo_tag_names || null
      };
    });
    
    console.log(`🚀 Catálogo unificado: ${catalog.length} items (${Date.now() - start}ms total)`);

    return catalog;
  } catch (error) {
    console.error("Error en _buildCatalog:", error);
    throw error;
  }
}

// Pre-warm: cargar catálogo al iniciar el módulo
setTimeout(() => {
  console.log("🔥 Pre-warming catálogo...");
  getFullCatalog().catch(err => console.error("Pre-warm falló:", err.message));
}, 1000);

// Mantener compatibilidad con el endpoint original (retorna TODO)
export async function getCatalog() {
  try {
    const catalog = await getFullCatalog();
    return { ok: true, total: catalog.length, data: catalog };
  } catch (error) {
    return { ok: false, message: "Error cargando catálogo", error };
  }
}

/**
 * Catálogo paginado con filtros server-side.
 * Retorna solo la página solicitada + conteos para las tarjetas de stats.
 */
export async function getCatalogPaginated({ page = 1, pageSize = 20, search = "", filter = "all", exactSearch = false, sedeCode = "" } = {}) {
  try {
    const catalog = await getFullCatalog();

    // Conteos (por sede si se especifica, global si no)
    const counts = {
      total: catalog.length,
      active: 0,
      unlinked: 0,
      no_image: 0
    };
    for (const item of catalog) {
      // Activo: si hay sedeCode, revisar active_sedes[sedeCode]; sino, el flag global
      const isActive = sedeCode 
        ? item.active_sedes?.[sedeCode] === true
        : item.ecommerce_active;
      if (isActive) counts.active++;
      if (!item.exists_in_woo) counts.unlinked++;
      if (!item.image_url) counts.no_image++;
    }

    // Filtrar
    let filtered = catalog;

    // Filtro por búsqueda
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      if (exactSearch) {
        // Búsqueda exacta por SKU/Item (Enter)
        filtered = filtered.filter(row =>
          String(row.item).trim().toLowerCase() === s
        );
      } else {
        // Búsqueda parcial por coincidencias (mientras escribe)
        filtered = filtered.filter(row =>
          String(row.item).toLowerCase().includes(s) ||
          (row.descripcion && row.descripcion.toLowerCase().includes(s))
        );
      }
    }

    // Filtro por tipo
    if (filter === "active") {
      filtered = filtered.filter(r => sedeCode ? r.active_sedes?.[sedeCode] === true : r.ecommerce_active);
    }
    else if (filter === "unlinked") filtered = filtered.filter(r => !r.exists_in_woo);
    else if (filter === "no_image") filtered = filtered.filter(r => !r.image_url);

    const totalFiltered = filtered.length;
    const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
    const safePage = Math.min(Math.max(1, page), totalPages);
    const data = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

    return {
      ok: true,
      data,
      page: safePage,
      pageSize,
      totalFiltered,
      totalPages,
      counts
    };
  } catch (error) {
    console.error("Error en getCatalogPaginated:", error);
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

  // Manejo de PUM (Precio por Unidad de Medida) via meta_data
  if (data.pum_qty !== undefined || data.pum_unit !== undefined) {
      const pumMeta = [];
      if (data.pum_qty !== undefined) {
          pumMeta.push({ key: "pum_qty", value: String(data.pum_qty) });
          pumMeta.push({ key: "_pum_qty", value: String(data.pum_qty) });
      }
      if (data.pum_unit !== undefined) {
          pumMeta.push({ key: "pum_unit", value: String(data.pum_unit) });
          pumMeta.push({ key: "_pum_unit", value: String(data.pum_unit) });
      }
      payload.meta_data = [...(payload.meta_data || []), ...pumMeta];
  }

  // Determinar si es sync de precio/stock (solo 1 sede) o edición de datos (todas las sedes)
  const isPriceStockOnly = (data.price !== undefined || data.stock_quantity !== undefined)
    && !data.name && !data.images && !data.image_url && !data.categories && !data.tags && !data.brands
    && data.pum_qty === undefined && data.pum_unit === undefined;

  let wooResponse;
  const sedeResults = [];

  // Obtener SKU del producto para buscarlo en otras sedes
  const { data: prodRow } = await supabase
    .from("ecommerce_products")
    .select("item")
    .eq("woo_product_id", wooId)
    .maybeSingle();
  const sku = prodRow?.item;

  if (isPriceStockOnly && data.sede) {
    // ══ Sync precio/stock → SOLO la sede indicada ══
    const client = await getWooClientForSede(data.sede);
    if (!client) throw new Error(`No se pudo obtener cliente WC para sede ${data.sede}`);

    let productId = data.sede === "PV001" ? wooId : null;
    if (!productId && sku) {
      const searchRes = await client.get("/products", { params: { sku } });
      if (searchRes.data.length > 0) productId = searchRes.data[0].id;
    }
    if (!productId) throw new Error(`Producto SKU ${sku} no encontrado en sede ${data.sede}`);

    const response = await client.put(`/products/${productId}`, payload);
    wooResponse = response.data;
    sedeResults.push({ sede: data.sede, ok: true });
    console.log(`✅ Precio/stock sincronizado en sede ${data.sede} (id=${productId})`);
  } else {
    // ══ Edición de datos del producto → TODAS las sedes EN PARALELO ══
    const allClients = await getAllSedeWooClients();

    const updatePromises = [...allClients.entries()].map(async ([sedeCode, client]) => {
      try {
        let productId = null;
        if (sedeCode === "PV001") {
          productId = wooId;
        } else if (sku) {
          const searchRes = await client.get("/products", { params: { sku } });
          if (searchRes.data.length > 0) productId = searchRes.data[0].id;
        }

        if (productId) {
          const response = await client.put(`/products/${productId}`, payload);
          console.log(`✅ Producto actualizado en sede ${sedeCode} (id=${productId})`);
          return { sede: sedeCode, ok: true, response: sedeCode === "PV001" ? response.data : null };
        }
        return { sede: sedeCode, ok: false, reason: "SKU no encontrado" };
      } catch (error) {
        const msg = error.response?.data?.message || error.message;
        console.error(`❌ Error actualizando en sede ${sedeCode}:`, msg);
        return { sede: sedeCode, ok: false, reason: msg };
      }
    });

    const results = await Promise.allSettled(updatePromises);
    for (const r of results) {
      const val = r.status === 'fulfilled' ? r.value : { sede: '?', ok: false, reason: r.reason?.message };
      sedeResults.push(val);
      if (val.sede === "PV001" && val.response) wooResponse = val.response;
      if (val.sede === "PV001" && !val.ok) {
        throw new Error(`WooCommerce rechazó la actualización: ${val.reason}`);
      }
    }
  }

  console.log("📊 Resultado sync multi-sede:", sedeResults);

  // 2. Update Local Mirror
  const updateLocal = {};
  if (data.images && data.images.length > 0) updateLocal.image_url = data.images[0];
  else if (data.image_url) updateLocal.image_url = data.image_url;
  if (data.name) updateLocal.woo_name = data.name; 
  
  // FIX: Guardar categorías y tags en local desde la RESPUESTA de Woo
  if (wooResponse) {
      if (wooResponse.categories && Array.isArray(wooResponse.categories)) {
          updateLocal.woo_category_names = wooResponse.categories.map(c => c.name).join(", ");
      }
      if (wooResponse.tags && Array.isArray(wooResponse.tags)) {
          updateLocal.woo_tag_names = wooResponse.tags.map(t => t.name).join(", ");
      }
  }
  
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
          // Dinámico: usar sede/lista del request, fallback a PV001/P01
          const SEDE_INIT = data.sede || "PV001";
          const LISTA_INIT = data.lista || "P01";
          
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

      // PUM (Precio por Unidad de Medida) via meta_data
      if (data.pum_qty || data.pum_unit) {
          const pumMeta = [];
          if (data.pum_qty) {
              pumMeta.push({ key: "pum_qty", value: String(data.pum_qty) });
              pumMeta.push({ key: "_pum_qty", value: String(data.pum_qty) });
          }
          if (data.pum_unit) {
              pumMeta.push({ key: "pum_unit", value: String(data.pum_unit) });
              pumMeta.push({ key: "_pum_unit", value: String(data.pum_unit) });
          }
          payload.meta_data = [...(payload.meta_data || []), ...pumMeta];
      }

      const response = await wooApi.post("/products", payload);
      const newWooId = response.data.id;
      
      console.log(`✅ Producto creado en PV001: ${newWooId} - ${response.data.name}`);

      // ══════════════════════════════════════════════════════════════
      // CREAR EN TODAS LAS SEDES con precio/stock respectivo
      // ══════════════════════════════════════════════════════════════
      const allClients = await getAllSedeWooClients();
      const { data: sedesConfig } = await supabase
        .from("wc_sedes")
        .select("codigo_siesa, lista_precio")
        .eq("activa", true);
      const sedeListaMap = {};
      (sedesConfig || []).forEach(s => { sedeListaMap[s.codigo_siesa] = s.lista_precio; });

      const sedeCreateResults = [];
      const activeSedes = { PV001: true };

      // Crear en paralelo en las otras sedes
      const otherSedes = [...allClients.entries()].filter(([code]) => code !== "PV001");
      if (otherSedes.length > 0) {
        const createPromises = otherSedes.map(async ([sedeCode, client]) => {
          try {
            // Obtener precio/stock de SIESA para esta sede
            const lista = sedeListaMap[sedeCode] || "GRAL";
            const [sedeStock, sedePrice] = await Promise.all([
              getLiveStockForItem({ item: data.sku, sede: sedeCode }).catch(() => null),
              getLivePriceForItem({ item: data.sku, sedeLista: lista }).catch(() => null)
            ]);

            let sStock = 0;
            if (sedeStock?.disponible != null) sStock = sedeStock.disponible;
            else if (sedeStock?.existencia != null) sStock = sedeStock.existencia;

            const sPrice = sedePrice?.precio ?? initialPrice;

            const sedePayload = {
              ...payload,
              stock_quantity: sStock,
              regular_price: sPrice ? String(sPrice) : undefined
            };

            const sedeRes = await client.post("/products", sedePayload);
            console.log(`✅ Producto creado en sede ${sedeCode}: ${sedeRes.data.id} (stock=${sStock}, price=${sPrice})`);
            activeSedes[sedeCode] = true;
            return { sede: sedeCode, ok: true, id: sedeRes.data.id };
          } catch (err) {
            const msg = err.response?.data?.message || err.message;
            console.error(`❌ Error creando en sede ${sedeCode}:`, msg);
            return { sede: sedeCode, ok: false, reason: msg };
          }
        });

        const results = await Promise.allSettled(createPromises);
        for (const r of results) {
          sedeCreateResults.push(r.status === 'fulfilled' ? r.value : { sede: '?', ok: false });
        }
      }

      console.log("📊 Creación multi-sede:", sedeCreateResults);
      
      // REGISTRAR EN SUPABASE PARA VINCULARLO INMEDIATAMENTE
      const { data: existing } = await supabase.from("ecommerce_products").select("*").eq("item", data.sku).single();
      
      let catNames = null;
      let tagNames = null;
      if (response.data.categories && Array.isArray(response.data.categories)) {
          catNames = response.data.categories.map(c => c.name).join(", ");
      }
      if (response.data.tags && Array.isArray(response.data.tags)) {
          tagNames = response.data.tags.map(t => t.name).join(", ");
      }

      // Merge active_sedes: sede que hizo la creación + todas las que crearon ok
      const creatingSede = data.sede || "PV001";
      activeSedes[creatingSede] = true;

      if (existing) {
          const mergedSedes = { ...(existing.active_sedes || {}), ...activeSedes };
          await supabase.from("ecommerce_products").update({
              woo_product_id: newWooId,
              woo_status: 'publish',
              ecommerce_active: true,
              active_sedes: mergedSedes,
              last_sync: new Date(),
              image_url: data.image_url || existing.image_url,
              woo_category_names: catNames,
              woo_tag_names: tagNames
          }).eq("item", data.sku);
      } else {
          await supabase.from("ecommerce_products").insert({
              item: data.sku,
              woo_product_id: newWooId,
              woo_status: 'publish',
              ecommerce_active: true,
              active_sedes: activeSedes,
              last_sync: new Date(),
              image_url: data.image_url,
              woo_category_names: catNames,
              woo_tag_names: tagNames
          });
      }

      invalidateCatalogCache();

      return {
          ok: true,
          data: response.data,
          sedeResults: sedeCreateResults
      };

  } catch (error) {
      console.error("Error creando producto en Woo:", error.response?.data || error.message);
      // Si el error es "SKU ya existe", podríamos intentar recuperar ese ID y vincularlo
      throw error;
  }
}

export async function toggleCatalogItem({ item, active, sedeCode = "PV001" }) {
  const sku = String(item);

  // 1. Buscar en ecommerce_products
  const { data: ecommerce, error: ecommerceError } = await supabase
    .from("ecommerce_products")
    .select("*")
    .eq("item", sku)
    .maybeSingle();

  if (ecommerceError) {
    return { ok: false, message: "Error leyendo ecommerce_products", error: ecommerceError };
  }

  // Obtener cliente WooCommerce de la sede destino (null si no hay credenciales)
  const sedeWooClient = await getWooClientForSede(sedeCode);
  let wooSyncOk = false;
  let sedeProductId = ecommerce?.woo_product_id || null;

  if (sedeWooClient) {
    // Buscar producto en la sede por SKU
    try {
      const searchRes = await sedeWooClient.get("/products", { params: { sku } });
      if (searchRes.data.length > 0) {
        sedeProductId = searchRes.data[0].id;
      }
    } catch (err) {
      console.error(`Error buscando SKU ${sku} en sede ${sedeCode}:`, err.message);
    }

    // Cambiar estado en el WooCommerce de la sede
    if (sedeProductId) {
      try {
        await sedeWooClient.put(`/products/${sedeProductId}`, {
          status: active ? "publish" : "draft",
        });
        console.log(`✅ Producto ${sku} → ${active ? 'publish' : 'draft'} en sede ${sedeCode} (woo_id=${sedeProductId})`);
        wooSyncOk = true;
      } catch (err) {
        console.error(`Error al toglear producto en sede ${sedeCode}:`, err.message);
      }
    }
  } else {
    console.warn(`⚠️ Sede ${sedeCode} sin credenciales WC. Solo se actualiza Supabase.`);
  }

  // Actualizar Supabase (active_sedes + estado global) SIEMPRE
  const currentActiveSedes = { ...(ecommerce?.active_sedes || {}), [sedeCode]: active };
  const anySedeActive = Object.values(currentActiveSedes).some(v => v === true);

  // Si no existía el registro en ecommerce_products, crearlo
  if (!ecommerce) {
    await supabase.from("ecommerce_products").upsert({
      item: sku,
      woo_product_id: sedeProductId, // ID del woo principal si es PV001
      woo_status: anySedeActive ? "publish" : "draft",
      ecommerce_active: anySedeActive,
      active_sedes: currentActiveSedes,
      last_sync: new Date(),
    });
  } else {
    await supabase.from("ecommerce_products")
      .update({
        woo_status: anySedeActive ? "publish" : "draft",
        ecommerce_active: anySedeActive,
        active_sedes: currentActiveSedes,
        last_sync: new Date(),
      })
      .eq("item", sku);
  }

  invalidateCatalogCache();

  return {
    ok: true,
    created: false,
    woo_product_id: sedeProductId,
    active,
    active_sedes: currentActiveSedes,
    wooSyncOk,
    message: wooSyncOk ? undefined : `Estado guardado en base de datos. Para reflejar en WooCommerce, configura las credenciales de la sede ${sedeCode} en Supabase → wc_sedes.`
  };
}

export async function adoptWooProducts() {
  console.log("🚀 Iniciando sincronización completa de productos Woo");

  let page = 1;
  const perPage = 100;
  let totalProcessed = 0;
  let keepGoing = true;

  // Guardamos TODOS los woo_product_id que existen actualmente en WooCommerce
  const syncedWooIds = new Set();

  while (keepGoing) {
    console.log(`📦 Sincronizando Woo página ${page} (todas los estados)...`);

    // Pedimos TODOS los productos (publish, draft, pending, private)
    // OPTIMIZACIÓN: Solo pedimos id, sku, status, imagenes, categorias, tags
    const res = await wooApi.get("/products", {
      params: {
        per_page: perPage,
        page,
        _fields: "id,sku,status,images,name,categories,tags" 
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

      // Aplanar categorías y tags para cache rápida
      const catNames = p.categories?.map(c => c.name).join(", ") || "";
      const tagNames = p.tags?.map(t => t.name).join(", ") || "";

      // Registrar este ID como existente en Woo
      syncedWooIds.add(p.id);

      payload.push({
        item: String(itemKey),
        woo_product_id: p.id,
        woo_status: p.status,
        ecommerce_active: p.status === "publish",
        image_url: p.images?.[0]?.src || null,
        woo_name: p.name, 
        woo_category_names: catNames, // NUEVO CAMPO CACHE
        woo_tag_names: tagNames, // NUEVO CAMPO CACHE
        last_sync: new Date().toISOString()
      });
    }

    if (missingSkuCount > 0) {
      console.warn(`⚠️ Alerta: ${missingSkuCount} productos en esta página NO tienen SKU (Se usó ID, posible error de vínculo).`);
    }

    // UPSERT EN BLOQUE
    // Usa "item" (SKU) como clave de conflicto para que al re-subir productos a Woo
    // se actualicen los registros existentes en vez de crear duplicados.
    // Esto cubre el caso donde se borran todos los productos de Woo y se vuelven a crear
    // (nuevos woo_product_id pero mismo SKU).
    const { error: upsertError } = await supabase
      .from("ecommerce_products")
      .upsert(payload, { onConflict: "item" });

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

  // ═══════════════════════════════════════════════════════════════
  // LIMPIEZA: Marcar como inactivos los productos que YA NO existen en WooCommerce
  // Esto resuelve el caso donde se borran productos de Woo pero quedan
  // como "Publicados" en la tabla local ecommerce_products.
  // ═══════════════════════════════════════════════════════════════
  console.log("🧹 Limpiando productos que ya no existen en WooCommerce...");

  // Obtener TODOS los registros locales que tienen woo_product_id asignado
  // Usamos fetchAllRows para paginar y no quedarnos cortos con el límite de Supabase
  let localLinked = [];
  let fetchError = null;
  try {
    localLinked = await fetchAllRows("ecommerce_products", "id, woo_product_id, item");
    // Filtrar solo los que tienen woo_product_id asignado
    localLinked = localLinked.filter((r) => r.woo_product_id != null);
    console.log(`📊 Total registros locales con woo_product_id: ${localLinked.length}`);
  } catch (err) {
    fetchError = err;
  }

  if (fetchError) {
    console.error("❌ Error obteniendo productos locales para limpieza:", fetchError);
  } else {
    // Filtrar los que ya NO están en WooCommerce
    const orphanedRecords = (localLinked || []).filter(
      (r) => !syncedWooIds.has(r.woo_product_id)
    );

    if (orphanedRecords.length > 0) {
      console.log(`🗑️ Encontrados ${orphanedRecords.length} productos huérfanos (ya no existen en Woo). Limpiando...`);

      // Limpiar en lotes de 200 para no sobrecargar Supabase
      const batchSize = 200;
      for (let i = 0; i < orphanedRecords.length; i += batchSize) {
        const batch = orphanedRecords.slice(i, i + batchSize);
        const orphanIds = batch.map((r) => r.id);

        const { error: cleanError } = await supabase
          .from("ecommerce_products")
          .update({
            woo_product_id: null,
            woo_status: null,
            ecommerce_active: false,
            active_sedes: {},
            woo_name: null,
            woo_category_names: null,
            woo_tag_names: null,
            image_url: null,
            last_sync: new Date().toISOString()
          })
          .in("id", orphanIds);

        if (cleanError) {
          console.error(`❌ Error limpiando lote de huérfanos:`, cleanError);
        } else {
          console.log(`✅ Limpiados ${batch.length} productos huérfanos (lote ${Math.floor(i / batchSize) + 1})`);
        }
      }
    } else {
      console.log("✅ No hay productos huérfanos que limpiar");
    }
  }

  console.log("🏁 Sincronización finalizada");
  console.log(`🎉 Total productos procesados: ${totalProcessed}`);

  // Inicializar active_sedes para productos que no lo tienen
  // Obtener todos los codigos de sede activos
  const { data: allSedes } = await supabase.from("wc_sedes").select("codigo_siesa").eq("activa", true);
  const allSedesObj = {};
  (allSedes || []).forEach(s => { allSedesObj[s.codigo_siesa] = true; });
  
  console.log("🏷️ Inicializando active_sedes para productos sin configuración por sede...");
  
  // Buscar productos activos sin active_sedes y actualizarlos en lote
  const { data: needsMigration } = await supabase
    .from("ecommerce_products")
    .select("item")
    .eq("ecommerce_active", true)
    .or("active_sedes.is.null,active_sedes.eq.{}");
  
  if (needsMigration && needsMigration.length > 0) {
    const migrateBatch = 200;
    for (let i = 0; i < needsMigration.length; i += migrateBatch) {
      const batch = needsMigration.slice(i, i + migrateBatch);
      const items = batch.map(r => r.item);
      await supabase.from("ecommerce_products")
        .update({ active_sedes: allSedesObj })
        .in("item", items);
    }
    console.log(`✅ Migrados ${needsMigration.length} productos a active_sedes (${Object.keys(allSedesObj).join(', ')})`);
  }

  // Invalidar caché para que la próxima carga refleje los cambios
  invalidateCatalogCache();

  return {
    ok: true,
    processed: totalProcessed,
    cleaned: (localLinked || []).filter((r) => !syncedWooIds.has(r.woo_product_id)).length,
    message: "Sincronización con WooCommerce completada"
  };
}

// =============================================
// SEDES - Lectura de wc_sedes desde Supabase
// =============================================
export async function getSedes() {
  const { data, error } = await supabase
    .from("wc_sedes")
    .select("id, nombre, slug, codigo_siesa, lista_precio")
    .eq("activa", true)
    .order("nombre");

  if (error) throw new Error("Error consultando sedes: " + error.message);
  return { ok: true, sedes: data };
}

export async function getLiveComparison({ sede, page = 1, limit = 20, item }) {
  // 1️⃣ Mapeo sede → lista dinámico desde wc_sedes
  const { data: sedesData } = await supabase
    .from("wc_sedes")
    .select("codigo_siesa, lista_precio")
    .eq("activa", true);

  const sedeMap = {};
  if (sedesData) {
    sedesData.forEach(s => { sedeMap[s.codigo_siesa] = s.lista_precio; });
  }

  const lista = sedeMap[sede] ?? "GRAL";

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

  // 1️⃣ Optimización: Traer precios Woo en Batch (de la sede seleccionada)
  const wooIds = products.map((p) => p.woo_product_id);
  const skus = products.map((p) => p.item);
  
  // Para PV001 usamos IDs directos, para otras sedes buscamos por SKU
  let wooDataMap = {};
  let skuWooMap = {};
  if (sede === "PV001" || !sede) {
    wooDataMap = await getWooPricesByIds(wooIds);
  } else {
    skuWooMap = await getWooPricesBySkus(skus, sede);
  }

  // 2️⃣ Optimización: Procesamiento en paralelo con caché Siesa
  // El caché individual de precio/stock (3 min TTL) hace que items ya consultados
  // se resuelvan instantáneamente sin llamar a Siesa de nuevo.
  // Batch de 10 en paralelo (el caché individual absorbe la carga).
  const BATCH_SIZE = 10;
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

        // Para PV001: buscar por woo_product_id. Para otras sedes: buscar por SKU
        let wooInfo;
        let sedeWooProductId = p.woo_product_id;
        if (sede === "PV001" || !sede) {
          wooInfo = wooDataMap[p.woo_product_id] || { price: null, stock: null };
        } else {
          const skuInfo = skuWooMap[p.item] || { price: null, stock: null, woo_product_id: null };
          wooInfo = skuInfo;
          if (skuInfo.woo_product_id) sedeWooProductId = skuInfo.woo_product_id;
        }
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

    // 🛑 Pausa reducida entre lotes (el caché individual de Siesa evita llamadas duplicadas)
    if (i + BATCH_SIZE < products.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return {
    ok: true,
    total: count,
    data: results
  };
}

