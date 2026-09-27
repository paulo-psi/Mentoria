import { Router, type IRouter } from "express";
import { GetHealthResponse, HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", async (req, res): Promise<void> => {
  try {
    await pool.query("SELECT 1");
    res.json(GetHealthResponse.parse({ status: "ok", database: "connected" }));
  } catch (err) {
    req.log.error({ err }, "Database health check failed");
    res.status(503).json(GetHealthResponse.parse({ status: "error", database: "disconnected" }));
  }
});

export default router;
