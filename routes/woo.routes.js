import express from "express";
import { 
    testConnection, 
    listProducts, 
    mapProducts,
    listCategories,
    addCategory,
    listTags,
    addTag
} from "../controllers/woo.controller.js";

const router = express.Router();

router.get("/test-connection", testConnection);
router.get("/products", listProducts);
router.post("/map-products", mapProducts);

// Categorías
router.get("/categories", listCategories);
router.post("/categories", addCategory);

// Etiquetas (Marcas)
router.get("/tags", listTags);
router.post("/tags", addTag);

export default router;
