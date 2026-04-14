import express from 'express';
import * as awdrService from '../services/awdr.service.js';

const router = express.Router();

// GET /api/awdr/:sede/diagnostic
router.get('/:sede/diagnostic', async (req, res) => {
  try {
    const result = await awdrService.diagnostic(req.params.sede);
    res.json(result);
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

// GET /api/awdr/:sede/settings
router.get('/:sede/settings', async (req, res) => {
  try {
    const result = await awdrService.getSettings(req.params.sede);
    res.json(result);
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

// GET /api/awdr/:sede/rules
router.get('/:sede/rules', async (req, res) => {
  try {
    const result = await awdrService.getRules(req.params.sede);
    res.json(result);
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

// POST /api/awdr/:sede/settings
router.post('/:sede/settings', async (req, res) => {
  try {
    const result = await awdrService.postSettings(req.params.sede, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

export default router;
