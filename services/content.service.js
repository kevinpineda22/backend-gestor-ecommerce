import supabase from "../supabaseClient.js";
import { getWooClientForSede, getAllSedeWooClients } from "./woo.service.js";

// --- SERVICIO DE BANNERS ---

export async function getBanners(section = 'home_slider', sede = null) {
    try {
        let query = supabase
            .from('content_banners')
            .select('*')
            .eq('section', section)
            .order('display_order', { ascending: true });
            
        const { data, error } = await query;
        if(error) throw error;

        // Filtrar por sede: mostrar banners donde sedes=null (todas) o que incluyan la sede
        let filtered = data;
        if (sede) {
            filtered = data.filter(b => !b.sedes || b.sedes.includes(sede));
        }

        return { ok: true, data: filtered };
    } catch (e) {
        console.error("Error getBanners:", e);
        return { ok: false, message: e.message };
    }
}

export async function createBanner(bannerData) {
    try {
        const { data, error } = await supabase
            .from('content_banners')
            .insert([bannerData]);
            
        if(error) throw error;
        return { ok: true, data };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}

export async function updateBanner(id, updates) {
    try {
        const { error } = await supabase
            .from('content_banners')
            .update(updates)
            .eq('id', id);
            
        if(error) throw error;
        return { ok: true };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}

export async function deleteBanner(id) {
    try {
        const { error } = await supabase
            .from('content_banners')
            .delete()
            .eq('id', id);
            
        if(error) throw error;
        return { ok: true };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}

// --- SERVICIO DE REGLAS DE DESCUENTO ---

export async function getDiscountRules() {
    try {
        const { data, error } = await supabase
            .from('discount_rules')
            .select('*')
            .order('display_order', { ascending: true });

        if (error) throw error;
        return { ok: true, data };
    } catch (e) {
        console.error("Error getDiscountRules:", e);
        return { ok: false, message: e.message };
    }
}

export async function createDiscountRule(ruleData) {
    try {
        const { data, error } = await supabase
            .from('discount_rules')
            .insert([ruleData])
            .select();

        if (error) throw error;
        return { ok: true, data };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}

export async function updateDiscountRule(id, updates) {
    try {
        const { error } = await supabase
            .from('discount_rules')
            .update(updates)
            .eq('id', id);

        if (error) throw error;
        return { ok: true };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}

export async function deleteDiscountRule(id) {
    try {
        const { error } = await supabase
            .from('discount_rules')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { ok: true };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}

// --- SERVICIO DE CONFIGURACIÓN LOGÍSTICA ---

export async function getLogisticsConfig(sedeCode) {
    try {
        const { data, error } = await supabase
            .from('logistics_config')
            .select('*')
            .eq('sede_code', sedeCode)
            .single();

        if (error && error.code === 'PGRST116') {
            // No row found
            return { ok: false, message: 'no_config' };
        }
        if (error) throw error;
        return { ok: true, data: data.config };
    } catch (e) {
        console.error("Error getLogisticsConfig:", e);
        return { ok: false, message: e.message };
    }
}

export async function saveLogisticsConfig(sedeCode, config) {
    try {
        const { error } = await supabase
            .from('logistics_config')
            .upsert({
                sede_code: sedeCode,
                config,
                updated_at: new Date().toISOString()
            }, { onConflict: 'sede_code' });

        if (error) throw error;
        return { ok: true };
    } catch (e) {
        console.error("Error saveLogisticsConfig:", e);
        return { ok: false, message: e.message };
    }
}

// --- SERVICIO: APLICAR DESCUENTOS DE VALOR (sale_price) EN WOOCOMMERCE ---

/**
 * FASE 1: Resolver productos — busca cada SKU en WooCommerce y retorna
 * un array de { productId, variationId|null, regularPrice, ... } listos para batch.
 * Se hace una sola vez por sede y se cachea el resultado.
 */
/**
 * Resuelve un lote de productos en paralelo con límite de concurrencia.
 */
async function resolveProductsInParallel(client, sedeCode, product_discounts, concurrency = 8) {
    const results = [];
    for (let i = 0; i < product_discounts.length; i += concurrency) {
        const chunk = product_discounts.slice(i, i + concurrency);
        const chunkResults = await Promise.all(chunk.map(pd => resolveSingleProduct(client, sedeCode, pd)));
        for (const r of chunkResults) results.push(...r); // cada item puede expandirse a múltiples variaciones
    }
    return results;
}

async function resolveProductsForSede(client, sedeCode, product_discounts) {
    return resolveProductsInParallel(client, sedeCode, product_discounts, 8);
}

async function resolveSingleProduct(client, sedeCode, pd) {
    const { sku, variation, woo_product_id, discount_amount } = pd;
    try {
            let productId = null;
            let productData = null;

            // Intentar por ID directo (solo PV001)
            if (sedeCode === "PV001" && woo_product_id) {
                try {
                    const res = await client.get(`/products/${woo_product_id}`, {
                        params: { _fields: "id,sku,price,regular_price,type" }
                    });
                    productId = woo_product_id;
                    productData = res.data;
                } catch (e) { /* fallback to SKU search */ }
            }

            // Buscar por SKU
            if (!productId) {
                const searchRes = await client.get("/products", {
                    params: { sku, per_page: 1, _fields: "id,sku,price,regular_price,type" }
                });
                if (searchRes.data.length > 0) {
                    productData = searchRes.data[0];
                    productId = productData.id;
                }
            }


            if (!productId) {
                return [{ ...pd, ok: false, message: "Producto no encontrado" }];
            }

            // Sin variación → verificar si es simple o variable
            if (!variation) {
                if (productData.type === 'variable') {
                    // Producto variable sin variación especificada:
                    // WooCommerce ignora sale_price en el padre → hay que aplicarlo a TODAS las variaciones
                    let variations = [];
                    try {
                        const varRes = await client.get(`/products/${productId}/variations`, {
                            params: { per_page: 100, _fields: "id,sku,price,regular_price" }
                        });
                        variations = varRes.data || [];
                    } catch (e) {
                        return [{ ...pd, ok: false, message: `Producto variable (${sku}): error obteniendo variaciones — ${e.message}` }];
                    }
                    if (variations.length === 0) {
                        return [{ ...pd, ok: false, message: `Producto variable (${sku}) sin variaciones en WooCommerce` }];
                    }
                    // Una entrada por cada variación, mismo discount_amount
                    return variations.map(v => ({
                        ...pd,
                        ok: true,
                        productId,
                        variationId: v.id,
                        regularPrice: Number(v.regular_price) || Number(v.price) || 0,
                        productType: 'variation',
                        sku: v.sku || pd.sku,
                    }));
                }
                // Producto simple
                const regularPrice = Number(productData.regular_price) || Number(productData.price) || 0;
                return [{
                    ...pd, ok: true, productId, variationId: null,
                    regularPrice, productType: 'simple',
                }];
            }

            // Con variación → buscar la variación correcta
            let variations = [];
            try {
                const varRes = await client.get(`/products/${productId}/variations`, {
                    params: { per_page: 100, _fields: "id,sku,price,regular_price,attributes" }
                });
                variations = varRes.data || [];
            } catch (e) {
                return [{ ...pd, ok: false, message: "Error obteniendo variaciones: " + e.message }];
            }

            const targetSkuFull = (sku + variation).toUpperCase();
            let matchedVar = variations.find(v => v.sku && v.sku.toUpperCase() === targetSkuFull);
            if (!matchedVar) {
                matchedVar = variations.find(v => {
                    if (!v.sku) return false;
                    const vSku = v.sku.toUpperCase();
                    return vSku.endsWith(variation.toUpperCase()) && vSku.startsWith(sku);
                });
            }
            if (!matchedVar) {
                matchedVar = variations.find(v =>
                    v.attributes?.some(a => a.option?.toUpperCase().includes(variation.toUpperCase()))
                );
            }

            if (!matchedVar) {
                return [{ ...pd, ok: false, message: `Variación ${variation} no encontrada` }];
            }

            const varRegularPrice = Number(matchedVar.regular_price) || Number(matchedVar.price) || 0;
            return [{
                ...pd, ok: true, productId, variationId: matchedVar.id,
                regularPrice: varRegularPrice, productType: 'variation',
            }];

        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            return [{ ...pd, ok: false, message: msg }];
        }
}

/**
 * FASE 2: Ejecutar batch update — agrupa por productId (simples vs variaciones)
 * y envía lotes de hasta 100 usando la batch API de WooCommerce.
 * 
 * WooCommerce batch API: POST /products/batch { update: [{id, sale_price, ...}] }
 * Para variaciones: POST /products/{parentId}/variations/batch { update: [...] }
 */
async function executeBatchUpdate(client, sedeCode, resolvedProducts, { remove = false, saleFromISO = "", saleToISO = "" }) {
    const results = [];

    // Separar simples de variaciones
    const simpleUpdates = [];
    const variationsByParent = new Map(); // parentId → [{ variationId, payload }]

    for (const rp of resolvedProducts) {
        if (!rp.ok) {
            results.push({ sede: sedeCode, sku: rp.sku, variation: rp.variation, ok: false, message: rp.message });
            continue;
        }

        let payload;
        if (remove || rp.discount_amount === 0) {
            payload = { sale_price: "", date_on_sale_from: "", date_on_sale_to: "" };
        } else {
            const salePrice = Math.max(0, rp.regularPrice - rp.discount_amount);
            payload = {
                sale_price: String(salePrice),
                date_on_sale_from: saleFromISO,
                date_on_sale_to: saleToISO,
            };
        }

        if (!rp.variationId) {
            // Producto simple → batch de productos
            simpleUpdates.push({
                _meta: { sku: rp.sku, variation: rp.variation, regularPrice: rp.regularPrice },
                id: rp.productId,
                ...payload,
            });
        } else {
            // Variación → agrupar por parentId
            if (!variationsByParent.has(rp.productId)) variationsByParent.set(rp.productId, []);
            variationsByParent.get(rp.productId).push({
                _meta: { sku: rp.sku, variation: rp.variation, regularPrice: rp.regularPrice },
                id: rp.variationId,
                ...payload,
            });
        }
    }

    // --- Batch simples (lotes de 100) ---
    const BATCH_SIZE = 100;
    for (let i = 0; i < simpleUpdates.length; i += BATCH_SIZE) {
        const batch = simpleUpdates.slice(i, i + BATCH_SIZE);
        try {
            // Separar _meta antes de enviar
            const updatePayload = batch.map(({ _meta, ...rest }) => rest);
            const batchRes = await client.post("/products/batch", { update: updatePayload });
            const updated = batchRes.data?.update || [];

            for (let j = 0; j < batch.length; j++) {
                const meta = batch[j]._meta;
                const wooResult = updated[j];
                if (wooResult?.error) {
                    results.push({ sede: sedeCode, sku: meta.sku, variation: null, ok: false, message: wooResult.error.message });
                } else {
                    results.push({
                        sede: sedeCode, sku: meta.sku, variation: null, ok: true,
                        regular_price: meta.regularPrice,
                        sale_price: batch[j].sale_price || null,
                    });
                }
            }
            console.log(`✅ [${sedeCode}] Batch productos simples: ${batch.length} actualizados (lote ${Math.floor(i / BATCH_SIZE) + 1})`);
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            console.error(`❌ [${sedeCode}] Error batch simples:`, msg);
            // Marcar todos como fallidos
            batch.forEach(b => results.push({
                sede: sedeCode, sku: b._meta.sku, variation: null, ok: false, message: "Batch error: " + msg,
            }));
        }
    }

    // --- Batch variaciones (agrupadas por parentId, lotes de 100) ---
    for (const [parentId, varUpdates] of variationsByParent) {
        for (let i = 0; i < varUpdates.length; i += BATCH_SIZE) {
            const batch = varUpdates.slice(i, i + BATCH_SIZE);
            try {
                const updatePayload = batch.map(({ _meta, ...rest }) => rest);
                const batchRes = await client.post(`/products/${parentId}/variations/batch`, { update: updatePayload });
                const updated = batchRes.data?.update || [];

                for (let j = 0; j < batch.length; j++) {
                    const meta = batch[j]._meta;
                    const wooResult = updated[j];
                    if (wooResult?.error) {
                        results.push({ sede: sedeCode, sku: meta.sku, variation: meta.variation, ok: false, message: wooResult.error.message });
                    } else {
                        results.push({
                            sede: sedeCode, sku: meta.sku, variation: meta.variation, ok: true,
                            variation_id: batch[j].id,
                            regular_price: meta.regularPrice,
                            sale_price: batch[j].sale_price || null,
                        });
                    }
                }
                console.log(`✅ [${sedeCode}] Batch variaciones (parent=${parentId}): ${batch.length} actualizadas`);
            } catch (err) {
                const msg = err.response?.data?.message || err.message;
                console.error(`❌ [${sedeCode}] Error batch variaciones (parent=${parentId}):`, msg);
                batch.forEach(b => results.push({
                    sede: sedeCode, sku: b._meta.sku, variation: b._meta.variation, ok: false, message: "Batch error: " + msg,
                }));
            }
        }
    }

    return results;
}

/**
 * Aplica o quita sale_price en WooCommerce para cada producto/variación.
 * Usa batch API para optimizar velocidad (max 100 por lote).
 * 
 * @param {Object} params
 * @param {Array} params.product_discounts - [{ sku, variation, woo_product_id, discount_amount }]
 * @param {Array} params.sedes - ["PV001", "00301", ...]
 * @param {Boolean} params.remove - Si true, quita el sale_price (envía "")
 * @param {String} params.date_from - "2026-04-14" (solo metadata, no bloquea aplicación)
 * @param {String} params.date_to - "2026-04-20"
 */
export async function applyValueDiscountsToWoo({ product_discounts, sedes, remove = false, date_from = null, date_to = null }) {
    if (!product_discounts || product_discounts.length === 0) {
        return { ok: false, message: "No hay productos para procesar" };
    }

    // WooCommerce espera fechas ISO 8601
    const saleFromISO = date_from ? `${date_from}T00:00:00` : "";
    const saleToISO = date_to ? `${date_to}T23:59:59` : "";

    const allResults = [];

    // Procesar todas las sedes en paralelo
    const sedeList = sedes || ["PV001"];
    const sedeResults = await Promise.all(sedeList.map(async (sedeCode) => {
        const client = await getWooClientForSede(sedeCode);
        if (!client) {
            return [{ sede: sedeCode, ok: false, message: "No se pudo obtener cliente WC" }];
        }
        console.log(`🔄 [${sedeCode}] Resolviendo ${product_discounts.length} productos en paralelo...`);
        const resolved = await resolveProductsForSede(client, sedeCode, product_discounts);
        console.log(`🔄 [${sedeCode}] Batch update (${resolved.filter(r => r.ok).length} resueltos)...`);
        return executeBatchUpdate(client, sedeCode, resolved, { remove, saleFromISO, saleToISO });
    }));
    for (const r of sedeResults) allResults.push(...r);

    const successCount = allResults.filter(r => r.ok).length;
    const failCount = allResults.filter(r => !r.ok).length;

    return {
        ok: true,
        results: allResults,
        summary: {
            total: allResults.length,
            success: successCount,
            failed: failCount,
        }
    };
}
