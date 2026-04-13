import express from 'express';
import supabase from '../supabaseClient.js';
import { applyValueDiscountsToWoo } from '../services/content.service.js';

const router = express.Router();

// Todos los códigos de sede disponibles
const ALL_SEDE_CODES = ['PV001', '00301', '00701', '00201'];

/**
 * GET /api/cron/apply-scheduled
 *
 * Ejecutado automáticamente por Vercel Cron a las 6:00 UTC (1:00 AM Colombia, UTC-5).
 * También puede llamarse manualmente con ?secret=CRON_SECRET para pruebas.
 *
 * Lógica:
 *  1. Obtiene la fecha de hoy en zona horaria de Colombia (UTC-5).
 *  2. Busca reglas discount_type='value_discount' con date_start=hoy y active=true.
 *  3. Aplica el sale_price en WooCommerce para cada regla y sus sedes.
 *     WooCommerce registra date_on_sale_from y date_on_sale_to,
 *     por lo que el precio tachado aparece/desaparece exactamente en las fechas configuradas.
 */
router.get('/apply-scheduled', async (req, res) => {
    // Validar autorización: Vercel Cron envía "Authorization: Bearer CRON_SECRET"
    const authHeader = req.headers['authorization'] || '';
    const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const tokenFromQuery = req.query.secret || '';
    const token = tokenFromHeader || tokenFromQuery;

    if (process.env.CRON_SECRET && token !== process.env.CRON_SECRET) {
        return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    // Fecha actual en Colombia (UTC-5)
    const nowColombia = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const todayStr = nowColombia.toISOString().split('T')[0]; // "YYYY-MM-DD"

    console.log(`🕐 [CRON] apply-scheduled ejecutado para fecha Colombia: ${todayStr}`);

    try {
        // Buscar reglas programadas para hoy
        const { data: rulesToApply, error: fetchError } = await supabase
            .from('discount_rules')
            .select('*')
            .eq('discount_type', 'value_discount')
            .eq('schedule_type', 'date_range')
            .eq('active', true)
            .eq('date_start', todayStr);

        if (fetchError) throw fetchError;

        if (!rulesToApply || rulesToApply.length === 0) {
            console.log(`✅ [CRON] No hay reglas programadas para ${todayStr}`);
            return res.json({
                ok: true,
                message: `No hay reglas de descuento programadas para hoy (${todayStr})`,
                applied: 0,
                date: todayStr,
            });
        }

        console.log(`🔄 [CRON] Encontradas ${rulesToApply.length} regla(s) para aplicar hoy`);

        const results = [];
        for (const rule of rulesToApply) {
            const productsWithDiscount = (rule.product_discounts || []).filter(pd => pd.discount_amount > 0);

            if (productsWithDiscount.length === 0) {
                console.warn(`⚠️ [CRON] Regla "${rule.title}" no tiene productos con descuento > 0, omitida`);
                results.push({
                    rule_id: rule.id,
                    title: rule.title,
                    skipped: true,
                    reason: 'Sin productos con descuento asignado',
                });
                continue;
            }

            const targetSedes = rule.sedes || ALL_SEDE_CODES;

            try {
                console.log(`🔄 [CRON] Aplicando regla "${rule.title}" → ${productsWithDiscount.length} productos × ${targetSedes.length} sedes`);
                const applyRes = await applyValueDiscountsToWoo({
                    product_discounts: productsWithDiscount,
                    sedes: targetSedes,
                    date_from: rule.date_start,
                    date_to: rule.date_end,
                });

                console.log(`✅ [CRON] Regla "${rule.title}": ${applyRes.summary?.success || 0} OK, ${applyRes.summary?.failed || 0} fallidos`);
                results.push({
                    rule_id: rule.id,
                    title: rule.title,
                    ok: applyRes.ok,
                    ...applyRes.summary,
                });
            } catch (applyErr) {
                console.error(`❌ [CRON] Error aplicando regla "${rule.title}":`, applyErr.message);
                results.push({
                    rule_id: rule.id,
                    title: rule.title,
                    ok: false,
                    error: applyErr.message,
                });
            }
        }

        const successCount = results.filter(r => r.ok).length;
        return res.json({
            ok: true,
            message: `Cron ejecutado: ${successCount}/${rulesToApply.length} regla(s) aplicadas para ${todayStr}`,
            applied: successCount,
            date: todayStr,
            results,
        });

    } catch (err) {
        console.error('❌ [CRON] Error general:', err.message);
        return res.status(500).json({ ok: false, message: err.message });
    }
});

export default router;
