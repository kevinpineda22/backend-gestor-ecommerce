/**
 * VERIFICACIÓN (solo lectura): ¿se están creando productos DUPLICADOS
 * al editar los productos con SKU "...UND" desde el gestor?
 *
 * Para cada base de ejemplo, busca en WooCommerce (PV001) tanto el SKU
 * "<base>" como "<base>UND", y consulta ecommerce_products en Supabase.
 * No modifica nada.
 */
import "dotenv/config";
import wooApi from "./services/woo.service.js";
import supabase from "./supabaseClient.js";

// Muestras tomadas del diagnóstico
const BASES = ["177924", "188827", "188826", "177923", "42", "787"];

async function searchWooBySku(sku) {
  try {
    const res = await wooApi.get("/products", {
      params: { sku, per_page: 10, _fields: "id,sku,name,status,images" },
    });
    return res.data.map(p => ({
      id: p.id,
      sku: JSON.stringify(p.sku), // JSON para ver espacios al final
      status: p.status,
      images: (p.images || []).length,
    }));
  } catch (e) {
    return [{ error: e.message }];
  }
}

async function checkEcommerceRow(item) {
  const { data } = await supabase
    .from("ecommerce_products")
    .select("item, woo_product_id, ecommerce_active, image_url")
    .eq("item", item)
    .maybeSingle();
  return data || null;
}

async function main() {
  for (const base of BASES) {
    console.log(`\n═══════════ BASE: ${base} ═══════════`);

    const wooBase = await searchWooBySku(base);
    const wooUnd = await searchWooBySku(base + "UND");
    // También probamos con espacio al final, como apareció en el diagnóstico
    const wooUndSpace = await searchWooBySku(base + "UND ");

    console.log(`  Woo busca "${base}":      `, JSON.stringify(wooBase));
    console.log(`  Woo busca "${base}UND":   `, JSON.stringify(wooUnd));
    console.log(`  Woo busca "${base}UND ":  `, JSON.stringify(wooUndSpace));

    const ecoBase = await checkEcommerceRow(base);
    const ecoUnd = await checkEcommerceRow(base + "UND");
    console.log(`  ecommerce_products["${base}"]:    `, JSON.stringify(ecoBase));
    console.log(`  ecommerce_products["${base}UND"]: `, JSON.stringify(ecoUnd));
  }
  console.log("\n✅ Verificación terminada. NO se modificó nada.");
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
