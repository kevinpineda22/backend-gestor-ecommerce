import { executeSiesaQuery } from "./siesa.client.js";

const DESC_PRECIOS = "API_v2_ItemsPrecios";

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
  const rows = await executeSiesaQuery({
    descripcion: DESC_PRECIOS,
    parametros: `f120_id=${item}`
  });

  if (!rows || rows.length === 0) {
    console.warn(`[getLivePriceForItem] Sin datos iniciales para item: ${item}`);
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

  return candidates[0];
}
