import { executeSiesaQuery } from "./siesa.client.js";

const DESC_PRECIOS = "API_v2_ItemsPrecios";

// ═══════════════════════════════════════════════
// CACHÉ EN MEMORIA - Precios Siesa (TTL 3 min)
// ═══════════════════════════════════════════════
const _priceCache = new Map();
const PRICE_CACHE_TTL = 3 * 60 * 1000; // 3 minutos

function getCachedPrice(cacheKey) {
  const entry = _priceCache.get(cacheKey);
  if (entry && (Date.now() - entry.time) < PRICE_CACHE_TTL) return entry.data;
  return undefined;
}

function setCachedPrice(cacheKey, data) {
  _priceCache.set(cacheKey, { data, time: Date.now() });
  // Limpieza periódica: si el caché crece mucho, limpiar entradas viejas
  if (_priceCache.size > 5000) {
    const now = Date.now();
    for (const [k, v] of _priceCache) {
      if (now - v.time > PRICE_CACHE_TTL) _priceCache.delete(k);
    }
  }
}

export function invalidatePriceCache() {
  _priceCache.clear();
  console.log("🗑️ Caché de precios Siesa limpiado");
}

const normalizeList = (lista) => {
  if (!lista || lista === "GRAL" || lista === "0") return 0;
  const n = String(lista).replace(/\D/g, "");
  return n ? Number(n) : -1;
};

const isUnd = (u) =>
  ["UND", "UN", "UNID", "UNIDAD"].includes(
    String(u).trim().toUpperCase()
  );

export async function getLivePriceForItem({ item, sedeLista }) {
  const cacheKey = `${item}_${sedeLista}`;
  const cached = getCachedPrice(cacheKey);
  if (cached !== undefined) return cached;

  const rows = await executeSiesaQuery({
    descripcion: DESC_PRECIOS,
    parametros: `f120_id=${item}`
  });

  if (!rows || rows.length === 0) {
    console.warn(`[getLivePriceForItem] Sin datos iniciales para item: ${item}`);
    setCachedPrice(cacheKey, null);
    return null;
  }

  const targetNum = normalizeList(sedeLista);

  const candidates = rows
    // 🔥 FILTRO CORRECTO POR CIA DEL PRECIO
    .filter(r => Number(r.f126_id_cia ?? 1) === 1)
    .map(r => ({
      lista: r.f126_id_lista_precio,
      unidad: String(r.f126_id_unidad_medida).trim(),
      precio: Number(r.f126_precio),
      fecha: r.f126_fecha_ts_actualizacion || r.f126_fecha_ts_creacion
    }))
    .filter(r => r.precio > 0);

  if (!candidates.length) {
    // Debug log para ver por qué se filtraron todos
    console.warn(`[getLivePriceForItem] 0 candidatos tras filtros. Rows encontrados: ${rows.length}`);
    setCachedPrice(cacheKey, null);
    return null;
  }

  candidates.sort((a, b) => {
    // 1️⃣ UND primero
    if (isUnd(a.unidad) && !isUnd(b.unidad)) return -1;
    if (!isUnd(a.unidad) && isUnd(b.unidad)) return 1;

    // 2️⃣ Lista de la sede
    const la = normalizeList(a.lista);
    const lb = normalizeList(b.lista);
    if (la === targetNum && lb !== targetNum) return -1;
    if (lb === targetNum && la !== targetNum) return 1;

    // 3️⃣ General
    if (la === 0 && lb !== 0) return -1;
    if (lb === 0 && la !== 0) return 1;

    // 4️⃣ Más reciente
    return String(b.fecha).localeCompare(String(a.fecha));
  });

  const result = candidates[0];
  setCachedPrice(cacheKey, result);
  return result;
}

/**
 * Retorna TODOS los precios de un item agrupados por unidad.
 * Para cada unidad, aplica la misma lógica de prioridad (lista sede → general → reciente).
 * Retorna: { UND: { unidad, precio, lista }, P48: { ... }, ... }
 */
export async function getAllPricesForItem({ item, sedeLista }) {
  const cacheKey = `ALL_${item}_${sedeLista}`;
  const cached = getCachedPrice(cacheKey);
  if (cached !== undefined) return cached;

  const rows = await executeSiesaQuery({
    descripcion: DESC_PRECIOS,
    parametros: `f120_id=${item}`
  });

  if (!rows || rows.length === 0) {
    setCachedPrice(cacheKey, {});
    return {};
  }

  const targetNum = normalizeList(sedeLista);

  const candidates = rows
    .filter(r => Number(r.f126_id_cia ?? 1) === 1)
    .map(r => ({
      lista: r.f126_id_lista_precio,
      unidad: String(r.f126_id_unidad_medida).trim(),
      precio: Number(r.f126_precio),
      fecha: r.f126_fecha_ts_actualizacion || r.f126_fecha_ts_creacion
    }))
    .filter(r => r.precio > 0);

  // Agrupar por unidad
  const byUnit = {};
  for (const c of candidates) {
    if (!byUnit[c.unidad]) byUnit[c.unidad] = [];
    byUnit[c.unidad].push(c);
  }

  // Para cada unidad, elegir el mejor precio (misma lógica de prioridad)
  const result = {};
  for (const [unit, unitCandidates] of Object.entries(byUnit)) {
    unitCandidates.sort((a, b) => {
      const la = normalizeList(a.lista);
      const lb = normalizeList(b.lista);
      if (la === targetNum && lb !== targetNum) return -1;
      if (lb === targetNum && la !== targetNum) return 1;
      if (la === 0 && lb !== 0) return -1;
      if (lb === 0 && la !== 0) return 1;
      return String(b.fecha).localeCompare(String(a.fecha));
    });
    result[unit] = unitCandidates[0];
  }

  setCachedPrice(cacheKey, result);
  return result;
}
