import "dotenv/config";
import express from "express";
import cors from "cors";
import wooRoutes from "./routes/woo.routes.js";
import catalogRoutes from "./routes/catalog.routes.js";
import contentRoutes from "./routes/content.routes.js";
import cronRoutes from "./routes/cron.routes.js";
import awdrRoutes from "./routes/awdr.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/woo", wooRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/awdr", awdrRoutes);

app.get("/", (req, res) => {
  res.json({ status: "Gestor Ecommerce API OK" });
});

// ═══════ Global Error Handler ═══════
app.use((err, req, res, _next) => {
  console.error("❌ Unhandled Error:", err.message);
  res.status(err.status || 500).json({
    ok: false,
    message: err.message || "Error interno del servidor",
  });
});

export default app;
