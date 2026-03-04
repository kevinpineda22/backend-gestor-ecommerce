import { executeSiesaQuery } from "./siesa.client.js";

const DESC_INVENTARIO = "API_v2_Inventarios_InvFecha";

// ═══════════════════════════════════════════════
// CACHÉ EN MEMORIA - Stock Siesa (TTL 3 min)
// ═══════════════════════════════════════════════
const _stockCache = new Map();
const STOCK_CACHE_TTL = 3 * 60 * 1000; // 3 minutos

function getCachedStock(cacheKey) {
  const entry = _stockCache.get(cacheKey);
  if (entry && (Date.now() - entry.time) < STOCK_CACHE_TTL) return entry.data;
  return undefined;
}

function setCachedStock(cacheKey, data) {
  _stockCache.set(cacheKey, { data, time: Date.now() });
  if (_stockCache.size > 5000) {
    const now = Date.now();
    for (const [k, v] of _stockCache) {
      if (now - v.time > STOCK_CACHE_TTL) _stockCache.delete(k);
    }
  }
}

export function invalidateStockCache() {
  _stockCache.clear();
  console.log("🗑️ Caché de stock Siesa limpiado");
}

export async function getLiveStockForItem({ item, sede }) {
  const cacheKey = `${item}_${sede}`;
  const cached = getCachedStock(cacheKey);
  if (cached !== undefined) return cached;

  const rows = await executeSiesaQuery({
    descripcion: DESC_INVENTARIO,
    parametros: `f120_id=${item}`
  });

  // �️ DEBUG TEMPORAL
  // Si no hay filas, puede ser item no encontrado o error.
  if (!rows || rows.length === 0) {
     // console.warn(`[DEBUG] Stock vacío para item: ${item}`);
  } else {
     // Ver qué sedes vienen
     // const sedesEncontradas = [...new Set(rows.map(r => r.f150_id))];
     // console.log(`[DEBUG] Stock encontrado para item ${item}. Sedes:`, sedesEncontradas);
  }

  // �👉 FILTRAR CIA = 1 + SEDE
  const filtered = rows.filter(
    r =>
      Number(r.f120_id_cia ?? 1) === 1 &&
      String(r.f150_id).trim() === String(sede)
  );

  let existencia = 0;
  let pos = 0;

  filtered.forEach(r => {
    existencia += Number(r.f400_cant_existencia_1 || 0);
    pos += Number(r.f400_cant_pos_1 || 0);
  });

  const result = { existencia, pos, disponible: existencia - pos };
  setCachedStock(cacheKey, result);
  return result;
}
