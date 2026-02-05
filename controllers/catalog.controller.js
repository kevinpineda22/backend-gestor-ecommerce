import * as catalogService from "../services/catalog.service.js";

/**
 * Listar catálogo unificado
 */
export async function listCatalog(req, res) {
  const result = await catalogService.getCatalog();

  if (!result.ok) {
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
}

/**
 * Activar / desactivar producto en ecommerce
 */
export async function toggleItem(req, res) {
  const { item, active } = req.body;

  if (!item || typeof active !== "boolean") {
    return res.status(400).json({
      ok: false,
      message: "item y active son obligatorios",
    });
  }

  const result = await catalogService.toggleCatalogItem({ item, active });

  if (!result.ok) {
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
}

/**
 * Adoptar productos existentes de Woo → Supabase
 */
export async function adoptWooProducts(req, res) {
  try {
    const result = await catalogService.adoptWooProducts();
    return res.json(result);
  } catch (err) {
    console.error("adoptWooProducts error:", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
}

/**
 * Herramienta de diagnóstico para items problemáticos
 */
export async function debugItem(req, res) {
  const { sku } = req.params;
  const result = await catalogService.debugSkuStatus(sku);
  return res.json(result);
}

/**
 * Actualizar producto en WooCommerce (Nombre, Imagen, Precio...)
 */
export async function updateProduct(req, res) {
  const { id } = req.params;
  const data = req.body; // { name, image_url, ... }

  try {
    const result = await catalogService.updateProductInWoo(id, data);
    return res.json(result);
  } catch (err) {
    console.error("updateProduct error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
}

/**
 * Comparación LIVE Woo vs Siesa (precio + inventario)
 * REVERTIDO: Usa catalog.service.js (LIVE) en vez de audit.service.js (SNAPSHOT)
 */
export async function liveCompare(req, res) {
  try {
    const { sede, page, limit, item } = req.query;

    const result = await catalogService.getLiveComparison({
        sede: sede || "PV001",
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        item
      });
  
    return res.json(result);

  } catch (err) {
    console.error("liveCompare error:", err);
    return res.status(500).json({
      ok: false,
      message: "Error en comparación en vivo",
      error: err.message
    });
  }
}
