import express from 'express';
import * as contentService from '../services/content.service.js';

const router = express.Router();

// ═══════ BANNERS ═══════

// GET /api/content/banners
router.get('/banners', async (req, res) => {
    try {
        const result = await contentService.getBanners(req.query.section || 'home_slider', req.query.sede || null);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// POST /api/content/banners
router.post('/banners', async (req, res) => {
    try {
        const result = await contentService.createBanner(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// PUT /api/content/banners/:id
router.put('/banners/:id', async (req, res) => {
    try {
        const result = await contentService.updateBanner(req.params.id, req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// DELETE /api/content/banners/:id
router.delete('/banners/:id', async (req, res) => {
    try {
        const result = await contentService.deleteBanner(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// ═══════ REGLAS DE DESCUENTO ═══════

// GET /api/content/discounts
router.get('/discounts', async (req, res) => {
    try {
        const result = await contentService.getDiscountRules();
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// GET /api/content/discounts/:id — usada por el plugin WP para la página /promo/descuento/{id}/
router.get('/discounts/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ ok: false, message: 'ID inválido' });
        const result = await contentService.getDiscountRules();
        if (!result.ok) return res.status(500).json(result);
        const rule = (result.data || []).find(r => r.id === id);
        if (!rule) return res.status(404).json({ ok: false, message: 'Regla no encontrada' });
        res.json({ ok: true, data: rule });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// POST /api/content/discounts/apply-value-discounts
// Aplica sale_price directamente en WooCommerce para descuentos tipo "value_discount"
router.post('/discounts/apply-value-discounts', async (req, res) => {
    try {
        const result = await contentService.applyValueDiscountsToWoo(req.body);
        res.json(result);
    } catch (err) {
        console.error("Error applying value discounts:", err);
        res.status(500).json({ ok: false, message: err.message });
    }
});

// POST /api/content/discounts
router.post('/discounts', async (req, res) => {
    try {
        const result = await contentService.createDiscountRule(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// PUT /api/content/discounts/:id
router.put('/discounts/:id', async (req, res) => {
    try {
        const result = await contentService.updateDiscountRule(req.params.id, req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// DELETE /api/content/discounts/:id
router.delete('/discounts/:id', async (req, res) => {
    try {
        const result = await contentService.deleteDiscountRule(req.params.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// ═══════ CONFIGURACIÓN LOGÍSTICA ═══════

// GET /api/content/logistics/:sedeCode
router.get('/logistics/:sedeCode', async (req, res) => {
    try {
        const result = await contentService.getLogisticsConfig(req.params.sedeCode);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// PUT /api/content/logistics/:sedeCode
router.put('/logistics/:sedeCode', async (req, res) => {
    try {
        const result = await contentService.saveLogisticsConfig(req.params.sedeCode, req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

export default router;
