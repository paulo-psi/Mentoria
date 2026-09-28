import { Router, type IRouter } from "express";
import { GetHealthResponse, HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();
export const HEALTH_DB_TIMEOUT_MS = 1_500;

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/health", async (req, res): Promise<void> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const readinessQuery = { text: "SELECT 1", query_timeout: HEALTH_DB_TIMEOUT_MS };
    await Promise.race([
      pool.query(readinessQuery),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Database health check timed out after ${HEALTH_DB_TIMEOUT_MS}ms`)),
          HEALTH_DB_TIMEOUT_MS,
        );
      }),
    ]);
    res.json(GetHealthResponse.parse({ status: "ok", database: "connected" }));
  } catch (err) {
    req.log.error({ err }, "Database health check failed");
    res.status(503).json(GetHealthResponse.parse({ status: "error", database: "disconnected" }));
  } finally {
    if (timeout) clearTimeout(timeout);
  }
});

export default router;
