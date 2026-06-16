/**
 * DIAGNÓSTICO (solo lectura): SKUs de WooCommerce que NO matchean Siesa
 * por culpa de un sufijo de unidad (UND, UN, KG, GR, etc.) pegado al final.
 *
 * No modifica NADA. Solo hace GET a Woo y SELECT a Supabase, y arma un reporte.
 *
 * Uso:
 *   node diagnose_sku_mismatch.js
 *
 * Salida: lista de productos { woo_id, sku_actual, sku_sugerido, nombre }
 * donde el SKU base (sin el sufijo) SÍ existe en items_siesa.
 */
import "dotenv/config";
import wooApi from "./services/woo.service.js";
import supabase from "./supabaseClient.js";

// Sufijos de unidad conocidos que suelen pegarse al código del ítem.
// Se evalúan en orden; el más largo primero para no cortar de menos.
const UNIT_SUFFIXES = ["UNIDAD", "UNID", "UND", "UN", "KGM", "KG", "GRM", "GR", "LTR", "LT", "ML", "MT", "CM"];

// Devuelve el SKU base si termina en un sufijo de unidad, o null si no aplica.
function stripUnitSuffix(sku) {
  const s = String(sku).trim().toUpperCase();
  for (const suf of UNIT_SUFFIXES) {
    if (s.length > suf.length && s.endsWith(suf)) {
      const base = s.slice(0, -suf.length);
      // El base debe quedar "limpio" (que no termine en otra letra rara)
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

async function loadAllWooProducts() {
  const products = [];
  let page = 1;
  while (true) {
    const res = await wooApi.get("/products", {
      params: { per_page: 100, page, _fields: "id,sku,name,status" },
    });
    if (!res.data || res.data.length === 0) break;
    products.push(...res.data);
    if (res.data.length < 100) break;
    page++;
  }
  return products;
}

async function main() {
  console.log("📥 Cargando ítems de Siesa...");
  const siesaIds = await loadAllSiesaIds();
  console.log(`   ✅ ${siesaIds.size} ítems en Siesa`);

  console.log("📥 Cargando productos de WooCommerce...");
  const wooProducts = await loadAllWooProducts();
  console.log(`   ✅ ${wooProducts.length} productos en Woo`);

  const fixable = [];   // base existe en Siesa → corregible quitando el sufijo
  const noSku = [];     // producto Woo sin SKU
  const orphan = [];    // SKU (ni base) no existe en Siesa → revisar aparte

  for (const p of wooProducts) {
    const sku = p.sku ? String(p.sku).trim().toUpperCase() : "";
    if (!sku) { noSku.push(p); continue; }

    // Ya matchea tal cual (con tolerancia a ceros a la izquierda)
    const skuNoZeros = sku.replace(/^0+/, "");
    if (siesaIds.has(sku) || siesaIds.has(skuNoZeros)) continue;

    // ¿Matchea si le quito el sufijo de unidad?
    const base = stripUnitSuffix(sku);
    if (base) {
      const baseNoZeros = base.replace(/^0+/, "");
      if (siesaIds.has(base) || siesaIds.has(baseNoZeros)) {
        fixable.push({ woo_id: p.id, sku_actual: p.sku, sku_sugerido: base, nombre: p.name, status: p.status });
        continue;
      }
    }
    orphan.push({ woo_id: p.id, sku: p.sku, nombre: p.name });
  }

  console.log("\n══════════════════════════════════════════════════════");
  console.log(`🟢 CORREGIBLES (quitar sufijo): ${fixable.length}`);
  console.log("══════════════════════════════════════════════════════");
  fixable.forEach(f =>
    console.log(`  woo_id=${f.woo_id} | "${f.sku_actual}" → "${f.sku_sugerido}" | ${f.nombre}`)
  );

  console.log(`\n⚪ Sin SKU en Woo: ${noSku.length}`);
  console.log(`⚠️  SKU no encontrado en Siesa (ni base): ${orphan.length}`);
  if (orphan.length > 0) {
    console.log("   (primeros 20)");
    orphan.slice(0, 20).forEach(o => console.log(`   woo_id=${o.woo_id} | "${o.sku}" | ${o.nombre}`));
  }

  console.log("\n✅ Diagnóstico terminado. NO se modificó nada.");
}

main().catch(err => {
  console.error("❌ Error en diagnóstico:", err.message);
  process.exit(1);
});
