import express from 'express';
import * as contentService from '../services/content.service.js';

const router = express.Router();

// GET /api/content/banners
router.get('/banners', async (req, res) => {
    const result = await contentService.getBanners(req.query.section || 'home_slider');
    res.json(result);
});

// POST /api/content/banners
router.post('/banners', async (req, res) => {
    // req.body: { title, image_url, link_url, active, display_order }
    const result = await contentService.createBanner(req.body);
    res.json(result);
});

// PUT /api/content/banners/:id
router.put('/banners/:id', async (req, res) => {
    const result = await contentService.updateBanner(req.params.id, req.body);
    res.json(result);
});

// DELETE /api/content/banners/:id
router.delete('/banners/:id', async (req, res) => {
    const result = await contentService.deleteBanner(req.params.id);
    res.json(result);
});

export default router;
