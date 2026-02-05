import { executeSiesaQuery } from "./siesa.client.js";

const DESC_INVENTARIO = "API_v2_Inventarios_InvFecha";

export async function getLiveStockForItem({ item, sede }) {
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

  return {
    existencia,
    pos,
    disponible: existencia - pos
  };
}
