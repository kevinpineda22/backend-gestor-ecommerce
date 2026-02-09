import axios from "axios";

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

// --- Debug temporal (puedes borrar luego) ---
console.log("✅ WC_URL:", WC_URL);

// --- Cliente Axios para WooCommerce ---
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
export async function getWooPricesByIds(ids) {
  // Eliminar duplicados y nulos/undefined
  const validIds = [...new Set(ids.filter((id) => id))];

  if (validIds.length === 0) return {};

  try {
    // Nota: 'include' acepta IDs separados por coma.
    // Woo paginación default es 10, api max es 100.
    const response = await wooApi.get("/products", {
      params: {
        include: validIds.join(","),
        per_page: 100, 
        _fields: "id,price,regular_price,stock_quantity,manage_stock", // Precio y Stock
      },
    });

    const dataMap = {};
    response.data.forEach((p) => {
      // Prioridad: price (actual) > regular_price > 0
      const price = Number(p.price) || Number(p.regular_price) || 0;
      dataMap[p.id] = {
        price,
        stock: p.manage_stock ? (p.stock_quantity || 0) : null 
      };
    });

    return dataMap;
  } catch (error) {
    console.error("⚠️ Error batch Woo prices:", error.message);
    return {};
  }
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

    while(keepGoing) {
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

// --- CATEGORÍAS ---
export async function getCategories() {
  try {
    // Usamos fetchAllWoo para traer TODAS
    const data = await fetchAllWoo("/products/categories");
    return {
      ok: true,
      data: data.map(c => ({ id: c.id, name: c.name, parent: c.parent }))
    };
  } catch (error) {
    console.error("Error fetching categories:", error.message);
    throw error;
  }
}

export async function createCategory(data) {
  try {
    const response = await wooApi.post("/products/categories", data);
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
    const data = await fetchAllWoo("/products/tags");
    return {
      ok: true,
      data: data.map(t => ({ id: t.id, name: t.name, slug: t.slug, count: t.count, taxonomy: 'tag' }))
    };
  } catch (error) {
    console.error("Error fetching tags:", error.message);
    throw error;
  }
}

export async function getBrands() {
  try {
    const data = await fetchAllWoo("/products/brands");
    return {
      ok: true,
      data: data.map(b => ({ id: b.id, name: b.name, slug: b.slug, count: b.count, taxonomy: 'brand' }))
    };
  } catch (error) {
    // Si falla (por ejemplo, no existe el plugin), retornamos array vacío
    console.warn("Endpoint /products/brands not found or failed. Ignoring brands.");
    return { ok: true, data: [] };
  }
}

export async function createTag(data) {
  try {
    // data espera: { name: "Nueva Marca" }
    const response = await wooApi.post("/products/tags", data);
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

export default wooApi;
