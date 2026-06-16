/**
 * MIGRACIÓN: Corrige el campo `item` en ecommerce_products para productos
 * cuyo SKU en WooCommerce tiene un sufijo de unidad (UND, KG, GR, etc.)
 * que no coincide con el f120_id de Siesa.
 *
 * Ej: "177924UND" → "177924"
 *
 * Uso seguro:
 *   node fix_sku_suffix_migration.js          # Solo diagnóstico
 *   node fix_sku_suffix_migration.js --apply   # Ejecuta la migración
 *
 * No modifica WooCommerce. Solo actualiza la tabla ecommerce_products en Supabase.
 */
import "dotenv/config";
import supabase from "./supabaseClient.js";

const UNIT_SUFFIXES = ["UNIDAD", "UNID", "UND", "UN", "KL", "KGM", "KG", "GRM", "GR", "LTR", "LT", "ML", "MT", "CM"];

function stripUnitSuffix(sku) {
  const s = String(sku).trim().toUpperCase();
  for (const suf of UNIT_SUFFIXES) {
    if (s.length > suf.length && s.endsWith(suf)) {
      const base = s.slice(0, -suf.length);
      if (base.length > 0) return base;
    }
  }
  return null;
}

async function loadAllSiesaIds() {
  const ids = new Set();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("items_siesa")
      .select("f120_id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      ids.add(String(r.f120_id).trim().toUpperCase());
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

async function main() {
  const APPLY = process.argv.includes("--apply");

  console.log("📥 Cargando ítems de Siesa...");
  const siesaIds = await loadAllSiesaIds();
  console.log(`   ✅ ${siesaIds.size} ítems en Siesa`);

  console.log("📥 Cargando registros de ecommerce_products (paginado)...");
  const records = [];
  {
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("ecommerce_products")
        .select("id, item, woo_product_id, ecommerce_active, active_sedes, image_url, woo_name")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      records.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
  }
  console.log(`   ✅ ${records.length} registros en ecommerce_products`);

  // Mapa de items existentes para detectar conflictos
  const itemMap = new Map();
  records.forEach(r => itemMap.set(String(r.item).trim().toUpperCase(), r));

  const toUpdate = [];   // item tiene sufijo y base existe en Siesa
  const conflicted = []; // base ya existe como otro registro
  const noTarget = [];   // base NO existe en Siesa (no se toca)

  for (const r of records) {
    const item = String(r.item).trim();
    const base = stripUnitSuffix(item);
    if (!base) continue;

    if (!siesaIds.has(base)) {
      noTarget.push({ record: r, base, item });
      continue;
    }

    const existing = itemMap.get(base);
    if (existing && existing.id !== r.id) {
      conflicted.push({ record: r, conflict: existing, base, item });
    } else {
      toUpdate.push({ record: r, base, item });
    }
  }

  console.log("\n═══════════════════════════════════════════");
  console.log("📊 DIAGNÓSTICO DE MIGRACIÓN");
  console.log("═══════════════════════════════════════════");
  console.log(`   🟢 Corregibles (UPDATE item):     ${toUpdate.length}`);
  console.log(`   🟡 Conflicto (base ya existe):    ${conflicted.length}`);
  console.log(`   ⚪ Sin base en Siesa (se omite):   ${noTarget.length}`);
  console.log("");

  if (toUpdate.length > 0) {
    console.log("🟢 CORREGIBLES (primeros 10):");
    toUpdate.slice(0, 10).forEach(f =>
      console.log(`   "${f.item}" → "${f.base}"  (woo_id=${f.record.woo_product_id})`)
    );
    if (toUpdate.length > 10) console.log(`   ... y ${toUpdate.length - 10} más`);
    console.log("");
  }

  if (conflicted.length > 0) {
    console.log("🟡 CONFLICTOS (primeros 10):");
    conflicted.slice(0, 10).forEach(f =>
      console.log(`   "${f.item}" → "${f.base}" COLISIONA con id=${f.conflict.id} (item="${f.conflict.item}")`)
    );
    if (conflicted.length > 10) console.log(`   ... y ${conflicted.length - 10} más`);
    console.log("");
  }

  if (noTarget.length > 0) {
    console.log("⚪ SIN BASE EN SIESA (primeros 10, no se modifican):");
    noTarget.slice(0, 10).forEach(f =>
      console.log(`   "${f.item}" → base="${f.base}" NO existe en Siesa`)
    );
    if (noTarget.length > 10) console.log(`   ... y ${noTarget.length - 10} más`);
    console.log("");
  }

  if (!APPLY) {
    console.log("\n⚠️  Modo diagnóstico — NO se realizaron cambios.");
    console.log("   Para ejecutar la migración: node fix_sku_suffix_migration.js --apply");
    return;
  }

  // ═══════════════════════════════════════════════
  // APLICAR MIGRACIÓN
  // ═══════════════════════════════════════════════
  console.log("\n⚠️  APLICANDO MIGRACIÓN...");

  // 1. Casos sin conflicto: solo UPDATE item
  let ok = 0, fail = 0;
  for (const f of toUpdate) {
    const { error } = await supabase
      .from("ecommerce_products")
      .update({ item: f.base })
      .eq("id", f.record.id);
    if (error) {
      console.error(`   ❌ id=${f.record.id} "${f.item}" → "${f.base}": ${error.message}`);
      fail++;
    } else {
      console.log(`   ✅ "${f.item}" → "${f.base}"`);
      ok++;
    }
  }
  console.log(`   → ${ok} actualizados, ${fail} errores`);

  // 2. Casos con conflicto: fusionar y eliminar duplicado
  let merged = 0, mergeFail = 0;
  for (const f of conflicted) {
    const existing = f.conflict;
    const mergedSedes = { ...(existing.active_sedes || {}), ...(f.record.active_sedes || {}) };
    const mergedActive = Object.values(mergedSedes).some(v => v === true);

    const { error: updErr } = await supabase
      .from("ecommerce_products")
      .update({
        active_sedes: mergedSedes,
        ecommerce_active: mergedActive,
        image_url: existing.image_url || f.record.image_url || null,
        woo_name: existing.woo_name || f.record.woo_name || null,
      })
      .eq("id", existing.id);

    if (updErr) {
      console.error(`   ❌ Error fusionando "${f.item}" → "${f.base}": ${updErr.message}`);
      mergeFail++;
      continue;
    }

    const { error: delErr } = await supabase
      .from("ecommerce_products")
      .delete()
      .eq("id", f.record.id);

    if (delErr) {
      console.error(`   ❌ Error eliminando duplicado id=${f.record.id}: ${delErr.message}`);
      mergeFail++;
    } else {
      console.log(`   🔀 "${f.item}" fusionado en "${f.base}" (active_sedes combinadas, duplicado eliminado)`);
      merged++;
    }
  }
  console.log(`   → ${merged} fusionados, ${mergeFail} errores`);

  console.log("\n✅ Migración finalizada.");
}

main().catch(err => {
  console.error("❌ Error en migración:", err.message);
  process.exit(1);
});
