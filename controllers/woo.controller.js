import { testWooConnection } from "../services/woo.service.js";
import { getWooProducts } from "../services/woo.service.js";
import { mapWooWithSupabase } from "../services/catalog.service.js";

export async function testConnection(req, res) {
  const result = await testWooConnection();

  if (!result.ok) {
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
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
