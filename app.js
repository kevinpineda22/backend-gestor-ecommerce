import "dotenv/config";
import express from "express";
import cors from "cors";
import wooRoutes from "./routes/woo.routes.js";
import catalogRoutes from "./routes/catalog.routes.js";
import contentRoutes from "./routes/content.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/woo", wooRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/content", contentRoutes);

app.get("/", (req, res) => {
  res.json({ status: "Gestor Ecommerce API OK" });
});

export default app;
