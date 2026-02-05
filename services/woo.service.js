import axios from "axios";

// --- Sanitización de variables de entorno ---
const WC_URL = process.env.WC_URL?.trim();
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


export default wooApi;
