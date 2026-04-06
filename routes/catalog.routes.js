import express from "express";
import multer from "multer";
import { listCatalog, toggleItem, adoptWooProducts, liveCompare, priceDiffReport, debugItem, updateProduct, listCategories, createCategory, getProductDetail, listVariations, updateVariationImage, syncVariationPrice, listTags, createTag, deleteTag, createNewProduct, getWooDetailsBatch, getDashboardStats, getSedes } from "../controllers/catalog.controller.js";
import { uploadImage } from "../controllers/upload.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/dashboard-stats", getDashboardStats);
router.get("/sedes", getSedes);
router.post("/woo-details", getWooDetailsBatch); // Nueva ruta para enriquecer tabla
router.post("/upload", upload.single("image"), uploadImage);
router.get("/", listCatalog);
router.get("/debug/:sku", debugItem);
router.get("/product/:id", getProductDetail);
router.get("/product/:id/variations", listVariations);
router.put("/product/:id/variations/:varId", updateVariationImage);
router.put("/product/:id/variations/:varId/sync-price", syncVariationPrice);
router.put("/product/:id", updateProduct); 
router.post("/product", createNewProduct); // Crear nuevo en Woo
router.post("/toggle", toggleItem);
router.post("/adopt-woo", adoptWooProducts);
router.get("/live-compare", liveCompare);
router.get("/price-diff-report", priceDiffReport);

// Categorías
router.get("/categories", listCategories);
router.post("/categories", createCategory);

// Etiquetas (Marcas)
router.get("/tags", listTags);
router.post("/tags", createTag);
router.delete("/tags/:id", deleteTag);

export default router;
