import { testWooConnection, getCategories, createCategory, getTags, createTag } from "../services/woo.service.js";
import { getWooProducts } from "../services/woo.service.js";
import { mapWooWithSupabase } from "../services/catalog.service.js";

export async function testConnection(req, res) {
  const result = await testWooConnection();

  if (!result.ok) {
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
}

export async function listCategories(req, res) {
  try {
    const result = await getCategories();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function addCategory(req, res) {
  try {
    const result = await createCategory(req.body);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function listTags(req, res) {
  try {
    const result = await getTags();
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function addTag(req, res) {
  try {
    const result = await createTag(req.body);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function listProducts(req, res) {
  const page = Number(req.query.page || 1);
  const perPage = Number(req.query.per_page || 50);

  const result = await getWooProducts({ page, perPage });

  if (!result.ok) {
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
}

export async function mapProducts(req, res) {
  const result = await mapWooWithSupabase();

  if (!result.ok) {
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
}
