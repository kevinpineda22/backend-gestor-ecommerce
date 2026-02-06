import * as catalogService from "../services/catalog.service.js";
import * as wooService from "../services/woo.service.js"; 

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
  const data = req.body; // { name, image_url, categories: [id, id] }

  try {
    const result = await catalogService.updateProductInWoo(id, data);
    return res.json(result);
  } catch (err) {
    console.error("updateProduct error:", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
}

// --- CATEGORIAS ---
export async function listCategories(req, res) {
  try {
    const result = await wooService.getCategories();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

export async function createCategory(req, res) {
  try {
    const result = await wooService.createCategory(req.body);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

// --- TAGS (MARCAS) ---
export async function listTags(req, res) {
  try {
    // Buscar tanto Tags como Brands (Plugin)
    const [tagsRes, brandsRes] = await Promise.all([
      wooService.getTags(),
      wooService.getBrands()
    ]);

    // Combinar resultados
    const allItems = [
      ...(tagsRes.ok ? tagsRes.data : []),
      ...(brandsRes.ok ? brandsRes.data : [])
    ];

    // Deduplicar (solo si nombre coincide exactamente, preferir Brand?)
    // Realmente, si existe una marca "Sony" y un tag "Sony", mostrarlos ambos podría confundir,
    // pero tienen IDs diferentes. Mejor mostrarlos y dejar que el usuario elija.
    // Ordenar por nombre
    allItems.sort((a,b) => a.name.localeCompare(b.name));

    return res.json({ ok: true, data: allItems });
  } catch (err) {
    console.error("❌ Error en listTags:", err.message);
    if(err.response) console.error("Detalle API Woo:", JSON.stringify(err.response.data));
    return res.status(500).json({ ok: false, message: err.message });
  }
}

export async function createTag(req, res) {
  try {
    const result = await wooService.createTag(req.body);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

export async function deleteTag(req, res) {
  try {
    const { id } = req.params;
    const result = await wooService.deleteTag(id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

export async function getProductDetail(req, res) {
    try {
        const { id } = req.params;
        const result = await wooService.getProduct(id);
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ ok: false, message: err.message });
    }
}

export async function createNewProduct(req, res) {
  try {
    const result = await catalogService.createProductInWoo(req.body);
    return res.json(result);
  } catch (err) {
    console.error("createProduct error:", err);
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
