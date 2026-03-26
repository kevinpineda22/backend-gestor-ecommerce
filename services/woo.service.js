import axios from "axios";
import supabase from "../supabaseClient.js";

// --- Sanitización de variables de entorno ---
const WC_URL = process.env.WC_URL?.trim().replace(/\/$/, ""); // Quitar slash final si existe
const WC_CONSUMER_KEY = process.env.WC_CONSUMER_KEY?.trim();
const WC_CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET?.trim();

// --- Validaciones duras (fallar rápido) ---
if (!WC_URL) {
  throw new Error("WC_URL no está definida o es inválida");
}

if (!WC_CONSUMER_KEY || !WC_CONSUMER_SECRET) {
  throw new Error("Credenciales de WooCommerce no están definidas");
}



// --- Cliente Axios para WooCommerce (PRINCIPAL / PV001) ---
const wooApi = axios.create({
  baseURL: `${WC_URL}/wp-json/wc/v3`,
  auth: {
    username: WC_CONSUMER_KEY,
    password: WC_CONSUMER_SECRET,
  },
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "GestorEcommerce-App/1.0"
  },
  timeout: 15000,
});

// ═══════════════════════════════════════════════════════════════
// CLIENTE WOOCOMMERCE POR SEDE
// ═══════════════════════════════════════════════════════════════
const _sedeClientsCache = new Map();
let _sedeCredsCache = null;
let _sedeCredsCacheTime = 0;
const SEDE_CREDS_TTL = 10 * 60 * 1000; // 10 min

async function getSedeCredentials() {
  if (_sedeCredsCache && (Date.now() - _sedeCredsCacheTime) < SEDE_CREDS_TTL) {
    return _sedeCredsCache;
  }
  try {
    const { data, error } = await supabase
      .from("wc_sedes")
      .select("codigo_siesa, wc_url, wc_consumer_key, wc_consumer_secret")
      .eq("activa", true);
    if (error) throw error;
    _sedeCredsCache = data || [];
  } catch (err) {
    // Si las columnas no existen aún (migración pendiente), retornar vacío
    console.warn("⚠️ No se pudieron leer credenciales WC por sede (¿migración pendiente?):", err.message);
    _sedeCredsCache = [];
  }
  _sedeCredsCacheTime = Date.now();
  return _sedeCredsCache;
}

/**
 * Retorna un cliente Axios WooCommerce para la sede indicada.
 * Usa la wc_url de la tabla wc_sedes + credenciales del .env como fallback.
 * Para PV001 usa el cliente principal directamente.
 */
export async function getWooClientForSede(sedeCode) {
  // PV001 usa el cliente principal
  if (sedeCode === "PV001") return wooApi;

  // Check cache
  if (_sedeClientsCache.has(sedeCode)) return _sedeClientsCache.get(sedeCode);

  const sedes = await getSedeCredentials();
  const sede = sedes.find(s => s.codigo_siesa === sedeCode);

  if (!sede?.wc_url) {
    console.warn(`⚠️ Sede ${sedeCode} no tiene wc_url configurada`);
    return null;
  }

  // Usar credenciales propias de la sede, o fallback a las del .env (compartidas)
  const key = sede.wc_consumer_key || WC_CONSUMER_KEY;
  const secret = sede.wc_consumer_secret || WC_CONSUMER_SECRET;

  const client = axios.create({
    baseURL: `${sede.wc_url.replace(/\/$/, "")}/wp-json/wc/v3`,
    auth: {
      username: key,
      password: secret,
    },
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "GestorEcommerce-App/1.0"
    },
    timeout: 15000,
  });

  _sedeClientsCache.set(sedeCode, client);
  console.log(`✅ Cliente WC creado para sede ${sedeCode} → ${sede.wc_url}`);
  return client;
}

/**
 * Retorna un Map<sedeCode, axiosClient> con TODAS las sedes activas.
 */
export async function getAllSedeWooClients() {
  const sedes = await getSedeCredentials();
  const clients = new Map();
  // Siempre incluir PV001
  clients.set("PV001", wooApi);
  for (const sede of sedes) {
    if (sede.codigo_siesa === "PV001" || !sede.wc_url) continue;
    const client = await getWooClientForSede(sede.codigo_siesa);
    if (client) clients.set(sede.codigo_siesa, client);
  }
  return clients;
}

// --- Test de conexión ---
export async function testWooConnection() {
  try {
    const response = await wooApi.get("/products", {
      params: { per_page: 1 },
    });

    return {
      ok: true,
      message: "Conexión exitosa con WooCommerce",
      sampleProduct: response.data?.[0] || null,
    };
  } catch (error) {
    return {
      ok: false,
      message: "Error conectando con WooCommerce",
      error: error.response?.data || error.message,
    };
  }
}

export async function getWooProducts({ page = 1, perPage = 50 } = {}) {
  try {
    const response = await wooApi.get("/products", {
      params: {
        page,
        per_page: perPage,
      },
    });

    return {
      ok: true,
      data: response.data.map((p) => ({
        woo_product_id: p.id,
        sku: p.sku,
        name: p.name,
        status: p.status,
        price: p.price,
        stock_quantity: p.stock_quantity,
        stock_status: p.stock_status,
        categories: p.categories?.map((c) => ({
          id: c.id,
          name: c.name,
        })) || [],
      })),
    };
  } catch (error) {
    return {
      ok: false,
      message: "Error obteniendo productos de WooCommerce",
      error: error.response?.data || error.message,
    };
  }
}

/**
 * Obtiene precios de múltiples productos Woo en una sola petición (BATCH)
 * Mucho más eficiente que llamar uno por uno.
 */
export async function getWooPricesByIds(ids, sedeCode) {
  // Eliminar duplicados y nulos/undefined
  const validIds = [...new Set(ids.filter((id) => id))];

  if (validIds.length === 0) return {};

  // Para PV001 o sin sede, usar IDs directos
  // Para otras sedes, los IDs de PV001 no aplican — se usa getWooPricesBySkus
  if (sedeCode && sedeCode !== "PV001") {
    return {}; // Las sedes no-PV001 usan getWooPricesBySkus
  }

  try {
    const response = await wooApi.get("/products", {
      params: {
        include: validIds.join(","),
        per_page: 100,
        _fields: "id,sku,price,regular_price,stock_quantity,manage_stock,type",
      },
    });

    const dataMap = {};
    const variableIds = [];

    response.data.forEach((p) => {
      const price = Number(p.price) || Number(p.regular_price) || 0;
      dataMap[p.id] = {
        price,
        stock: p.manage_stock ? (p.stock_quantity || 0) : null,
        type: p.type || 'simple',
        variations: []
      };
      if (p.type === 'variable') variableIds.push(p.id);
    });

    // Fetch variations for variable products in parallel
    if (variableIds.length > 0) {
      const varResults = await Promise.all(
        variableIds.map(async (parentId) => {
          try {
            const varRes = await wooApi.get(`/products/${parentId}/variations`, {
              params: { per_page: 100, _fields: "id,sku,price,regular_price,stock_quantity,manage_stock,attributes" }
            });
            return { parentId, variations: varRes.data };
          } catch (e) {
            console.warn(`⚠️ Error fetching variations for ${parentId}:`, e.message);
            return { parentId, variations: [] };
          }
        })
      );
      for (const { parentId, variations } of varResults) {
        dataMap[parentId].variations = variations.map(v => ({
          id: v.id,
          sku: v.sku,
          price: Number(v.price) || Number(v.regular_price) || 0,
          stock: v.manage_stock ? (v.stock_quantity || 0) : null,
          attributes: v.attributes || []
        }));
      }
    }

    return dataMap;
  } catch (error) {
    console.error("⚠️ Error batch Woo prices:", error.message);
    return {};
  }
}

/**
 * Obtener precios/stock de WooCommerce de una sede por SKUs.
 * Retorna Map<sku, { price, stock, woo_product_id }>.
 */
export async function getWooPricesBySkus(skus, sedeCode) {
  if (!skus || skus.length === 0) return {};

  const client = await getWooClientForSede(sedeCode);
  if (!client) return {};

  const dataMap = {};
  const BATCH = 10;
  for (let i = 0; i < skus.length; i += BATCH) {
    const batch = skus.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (sku) => {
        try {
          const res = await client.get("/products", {
            params: { sku, per_page: 1, _fields: "id,sku,price,regular_price,stock_quantity,manage_stock,type" }
          });
          if (res.data.length > 0) {
            const p = res.data[0];
            const entry = {
              sku,
              woo_product_id: p.id,
              price: Number(p.price) || Number(p.regular_price) || 0,
              stock: p.manage_stock ? (p.stock_quantity || 0) : null,
              type: p.type || 'simple',
              variations: []
            };
            // Fetch variations for variable products
            if (p.type === 'variable') {
              try {
                const varRes = await client.get(`/products/${p.id}/variations`, {
                  params: { per_page: 100, _fields: "id,sku,price,regular_price,stock_quantity,manage_stock,attributes" }
                });
                entry.variations = varRes.data.map(v => ({
                  id: v.id,
                  sku: v.sku,
                  price: Number(v.price) || Number(v.regular_price) || 0,
                  stock: v.manage_stock ? (v.stock_quantity || 0) : null,
                  attributes: v.attributes || []
                }));
              } catch (e) {
                console.warn(`⚠️ Error fetching variations for ${p.id} in sede ${sedeCode}:`, e.message);
              }
            }
            return entry;
          }
          return { sku, woo_product_id: null, price: null, stock: null, type: 'simple', variations: [] };
        } catch {
          return { sku, woo_product_id: null, price: null, stock: null, type: 'simple', variations: [] };
        }
      })
    );
    results.forEach(r => { dataMap[r.sku] = r; });
  }

  return dataMap;
}


export async function getWooDetailsByIds(ids) {
  // Eliminar duplicados y nulos/undefined
  const validIds = [...new Set(ids.filter((id) => id))];

  if (validIds.length === 0) return {};

  try {
    // Nota: 'include' acepta IDs separados por coma.
    // Pedimos solo lo necesario: id, categories, tags, brands (si las hubiera en attributes)
    const response = await wooApi.get("/products", {
      params: {
        include: validIds.join(","),
        per_page: 100, // Máximo permitido
        _fields: "id,categories,tags,attributes" // Limitamos respuesta
      },
    });

    const dataMap = {};
    response.data.forEach((p) => {
      dataMap[p.id] = {
        categories: p.categories || [],
        tags: p.tags || []
        // Si brands viene en attributes, habría que procesarlo aqui, pero por ahora categories/tags es lo pedido
      };
    });

    return dataMap;
  } catch (error) {
    console.error("⚠️ Error batch Woo details:", error.message);
    return {};
  }
}

// --- HELPER FETCH ALL ---
async function fetchAllWoo(endpoint) {
  let allData = [];
  let page = 1;
  let keepGoing = true;

  while (keepGoing) {
    const response = await wooApi.get(endpoint, {
      params: { per_page: 100, page }
    });
    allData = allData.concat(response.data);
    if (response.data.length < 100) {
      keepGoing = false;
    } else {
      page++;
    }
  }
  return allData;
}

// ══ Caché en memoria para categorías / tags / brands ══
let _catCache = null, _catCacheAt = 0;
let _tagCache = null, _tagCacheAt = 0;
let _brandCache = null, _brandCacheAt = 0;
const META_TTL = 10 * 60 * 1000; // 10 minutos

export function invalidateMetaCache() {
  _catCache = _tagCache = _brandCache = null;
  _catCacheAt = _tagCacheAt = _brandCacheAt = 0;
}

// --- CATEGORÍAS ---
export async function getCategories() {
  try {
    if (_catCache && (Date.now() - _catCacheAt < META_TTL)) {
      return { ok: true, data: _catCache };
    }
    const data = await fetchAllWoo("/products/categories");
    _catCache = data.map(c => ({ id: c.id, name: c.name, parent: c.parent }));
    _catCacheAt = Date.now();
    return { ok: true, data: _catCache };
  } catch (error) {
    console.error("Error fetching categories:", error.message);
    throw error;
  }
}

export async function createCategory(data) {
  try {
    const response = await wooApi.post("/products/categories", data);
    _catCache = null; // Invalidar caché
    return {
      ok: true,
      data: response.data
    };
  } catch (error) {
    console.error("Error creating category:", error.message);
    throw error;
  }
}

export async function getProduct(id) {
  try {
    const response = await wooApi.get(`/products/${id}`);
    return {
      ok: true,
      data: response.data
    };
  } catch (error) {
    console.error("Error fetching product:", error.message);
    throw error;
  }
}

// --- ETIQUETAS (TAGS) PARA MARCAS ---
export async function getTags() {
  try {
    if (_tagCache && (Date.now() - _tagCacheAt < META_TTL)) {
      return { ok: true, data: _tagCache };
    }
    const data = await fetchAllWoo("/products/tags");
    _tagCache = data.map(t => ({ id: t.id, name: t.name, slug: t.slug, count: t.count, taxonomy: 'tag' }));
    _tagCacheAt = Date.now();
    return { ok: true, data: _tagCache };
  } catch (error) {
    console.error("Error fetching tags:", error.message);
    throw error;
  }
}

export async function getBrands() {
  try {
    if (_brandCache && (Date.now() - _brandCacheAt < META_TTL)) {
      return { ok: true, data: _brandCache };
    }
    const data = await fetchAllWoo("/products/brands");
    _brandCache = data.map(b => ({ id: b.id, name: b.name, slug: b.slug, count: b.count, taxonomy: 'brand' }));
    _brandCacheAt = Date.now();
    return { ok: true, data: _brandCache };
  } catch (error) {
    console.warn("Endpoint /products/brands not found or failed. Ignoring brands.");
    return { ok: true, data: [] };
  }
}

export async function createTag(data) {
  try {
    // data espera: { name: "Nueva Marca" }
    const response = await wooApi.post("/products/tags", data);
    _tagCache = null; // Invalidar caché
    return {
      ok: true,
      data: response.data
    };
  } catch (error) {
    console.error("Error creating tag:", error.message);
    throw error;
  }
}

export async function deleteTag(id) {
  try {
    const response = await wooApi.delete(`/products/tags/${id}`, { params: { force: true } });
    _tagCache = null; // Invalidar caché
    return {
      ok: true,
      data: response.data
    };
  } catch (error) {
    console.error("Error deleting tag:", error.message);
    throw error;
  }
}

/**
 * Obtener reporte de ventas (Mes actual)
 */
export async function getSalesStats(period = "month") {
  try {
    const response = await wooApi.get("/reports/sales", {
      params: { period },
    });
    // La API devuelve un array de objetos (uno por reporte). 
    // Si pedimos 'month', suele venir 1 objeto con el acumulado del mes, o array de dias si pedimos rango.
    // woocommerce /reports/sales devuelve array.
    if (response.data && response.data.length > 0) {
      // Tomamos el último (o el sumatorio)
      const report = response.data[0];
      return {
        total_sales: report.total_sales,
        net_sales: report.net_sales,
        average_sales: report.average_sales,
        total_orders: report.total_orders,
        total_items: report.total_items,
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching sales reports:", error.message);
    return null;
  }
}

// Pre-warm: cargar categorías/tags/brands al iniciar para que estén listas
setTimeout(() => {
  Promise.all([getCategories(), getTags(), getBrands()])
    .then(() => console.log("✅ Meta cache (categories/tags/brands) pre-warmed"))
    .catch(e => console.warn("⚠️ Meta cache pre-warm partial:", e.message));
}, 2000);

export default wooApi;
