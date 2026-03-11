const PROD_API = "https://backend-gestor-ecommerce.vercel.app/api";
const LOCAL_API = "http://localhost:3000/api";

// Detectar automáticamente si estamos en entorno local o producción
const API_URL = (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"))
  ? LOCAL_API
  : PROD_API;

export async function fetchSedes() {
    const res = await fetch(`${API_URL}/catalog/sedes`);
    return res.json();
}

export async function fetchDashboardStats() {
    const res = await fetch(`${API_URL}/catalog/dashboard-stats`);
    return res.json();
}

export async function fetchLiveComparison({ sede, page = 1, item = "", limit = 20, filter = 'all' }) {
  const params = new URLSearchParams({
    sede: sede || "PV001",
    page: page.toString(),
    limit: limit.toString(),
    filter
  });
  if (item) params.append("item", item);

  const res = await fetch(`${API_URL}/catalog/live-compare?${params}`);
  return res.json();
}

export async function fetchWooDetailsBatch(ids) {
  const res = await fetch(`${API_URL}/catalog/woo-details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids })
  });
  return res.json();
}

// Nueva función para disparar el Snapshot
export async function runFullAudit(sede) {
  const res = await fetch(`${API_URL}/catalog/live-compare?snapshot=true&sede=${sede}`);
  return res.json();
}

export async function toggleProduct(item, active) {
  const res = await fetch(`${API_URL}/catalog/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item, active })
  });
  return res.json();
}

export async function adoptWooProducts() {
  const res = await fetch(`${API_URL}/catalog/adopt-woo`, {
    method: "POST"
  });
  return res.json();
}

export async function fetchCatalog({ page = 1, pageSize = 20, search = "", filter = "all", exactSearch = false } = {}) {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
    filter,
    t: Date.now().toString()
  });
  if (search.trim()) params.append("search", search.trim());
  if (exactSearch) params.append("exactSearch", "true");

  const res = await fetch(`${API_URL}/catalog?${params}`);
  return res.json();
}

export async function updateWooProduct(wooId, data) {
  const res = await fetch(`${API_URL}/catalog/product/${wooId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function createWooProduct(data) {
  const res = await fetch(`${API_URL}/catalog/product`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function uploadImage(file) {
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(`${API_URL}/catalog/upload`, {
    method: "POST",
    body: formData
  });
  
  if (!res.ok) {
    throw new Error("Error subiendo imagen");
  }
  
  return res.json();
}

// --- CATEGORÍAS ---
export async function fetchCategories() {
  const res = await fetch(`${API_URL}/catalog/categories`);
  return res.json();
}

export async function createCategory(data) {
  const res = await fetch(`${API_URL}/catalog/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

// --- ETIQUETAS (MARCAS) ---
export async function fetchTags() {
  const res = await fetch(`${API_URL}/catalog/tags`);
  return res.json();
}

export async function createTag(data) {
  const res = await fetch(`${API_URL}/catalog/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function deleteTag(id) {
  const res = await fetch(`${API_URL}/catalog/tags/${id}`, {
    method: "DELETE"
  });
  return res.json();
}

export async function fetchProductDetail(wooId) {
    const res = await fetch(`${API_URL}/catalog/product/${wooId}`);
    return res.json();
}

// --- BANNERS ---
export async function fetchBanners(section = 'home_slider') {
  const res = await fetch(`${API_URL}/content/banners?section=${section}`);
  return res.json();
}

export async function createBanner(data) {
  const res = await fetch(`${API_URL}/content/banners`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function updateBanner(id, data) {
  const res = await fetch(`${API_URL}/content/banners/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function deleteBanner(id) {
  const res = await fetch(`${API_URL}/content/banners/${id}`, {
    method: "DELETE"
  });
  return res.json();
}

// --- REGLAS DE DESCUENTO ---
export async function fetchDiscountRules() {
  const res = await fetch(`${API_URL}/content/discounts`);
  return res.json();
}

export async function createDiscountRule(data) {
  const res = await fetch(`${API_URL}/content/discounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function updateDiscountRule(id, data) {
  const res = await fetch(`${API_URL}/content/discounts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function deleteDiscountRule(id) {
  const res = await fetch(`${API_URL}/content/discounts/${id}`, {
    method: "DELETE"
  });
  return res.json();
}

// --- URLs de WordPress por sede ---
export const SEDE_WP_URLS = {
  'PV001':  'https://supermercadomerkahorro.com',
  '00301':  'https://girardota.supermercadomerkahorro.com',
  '00701':  'https://barbosa.supermercadomerkahorro.com',
  '00201':  'https://villahermosa.supermercadomerkahorro.com',
};

// --- SINCRONIZACIÓN DESCUENTOS → WORDPRESS (FlyCart) ---
export async function syncDiscountRulesToWP(wpUrl, rules) {
  const res = await fetch(`${wpUrl}/wp-json/merkahorro/v1/sync-discount-rules?key=merkahorro2026`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rules)
  });
  return res.json();
}

// --- CONFIGURACIÓN LOGÍSTICA POR SEDE ---
export async function fetchLogisticsConfig(sedeCode) {
  const res = await fetch(`${API_URL}/content/logistics/${encodeURIComponent(sedeCode)}`);
  return res.json();
}

export async function saveLogisticsConfig(sedeCode, config) {
  const res = await fetch(`${API_URL}/content/logistics/${encodeURIComponent(sedeCode)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config)
  });
  return res.json();
}
