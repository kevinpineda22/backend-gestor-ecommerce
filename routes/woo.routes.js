import express from "express";
import { testConnection, listProducts, mapProducts   } from "../controllers/woo.controller.js";

const router = express.Router();

router.get("/test-connection", testConnection);
router.get("/products", listProducts);
router.post("/map-products", mapProducts);

export default router;
