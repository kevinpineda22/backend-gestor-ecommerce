import express from "express";
import multer from "multer";
import { listCatalog, toggleItem, adoptWooProducts, liveCompare, debugItem, updateProduct } from "../controllers/catalog.controller.js";
import { uploadImage } from "../controllers/upload.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", upload.single("image"), uploadImage); // Nueva ruta de subida
router.get("/", listCatalog);
router.get("/debug/:sku", debugItem); // Nueva ruta de diagnóstico
router.put("/product/:id", updateProduct); // Nueva ruta de edición
router.post("/toggle", toggleItem);
router.post("/adopt-woo", adoptWooProducts);
router.get("/live-compare", liveCompare);

export default router;
