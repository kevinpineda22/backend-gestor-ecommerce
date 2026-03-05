import express from 'express';
import * as contentService from '../services/content.service.js';

const router = express.Router();

// ═══════ BANNERS ═══════

// GET /api/content/banners
router.get('/banners', async (req, res) => {
    try {
        const result = await contentService.getBanners(req.query.section || 'home_slider');
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

export default router;
