const API_URL = "http://localhost:3000/api";
// Updated services

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

export async function fetchCatalog() {
  // Agregamos timestamp para evitar caché del navegador
  const res = await fetch(`${API_URL}/catalog?t=${Date.now()}`);
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
