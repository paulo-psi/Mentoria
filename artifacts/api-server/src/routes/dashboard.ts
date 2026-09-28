import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { ErrorResponse, GetDashboardStatsResponse } from "@workspace/api-zod";
import { db, mentorsTable, mentoringSessionsTable } from "@workspace/db";
import { requireApprovedUser } from "../middlewares/requireApprovedUser";

const router: IRouter = Router();

router.get("/dashboard/stats", requireApprovedUser, async (req, res): Promise<void> => {
  try {
    const [metrics] = await db
      .select({
        totalSessions: sql<number>`count(${mentoringSessionsTable.id})`.mapWith(Number),
        avgNps: sql<number>`
          coalesce(round(avg(${mentoringSessionsTable.teamNps})::numeric, 1), 0)
        `.mapWith(Number),
        avgTraction: sql<number>`
          coalesce(round(avg(${mentoringSessionsTable.mentorTraction})::numeric, 1), 0)
        `.mapWith(Number),
        networkOpennessRate: sql<number>`
          case
            when count(${mentoringSessionsTable.id}) = 0 then 0
            else round(
              100.0 * count(*) filter (where ${mentorsTable.mentorType} = 'externo')
              / count(${mentoringSessionsTable.id}),
              1
            )
          end
        `.mapWith(Number),
      })
      .from(mentoringSessionsTable)
      .innerJoin(mentorsTable, eq(mentorsTable.id, mentoringSessionsTable.mentorId));

    res.json(GetDashboardStatsResponse.parse({
      totalSessions: metrics?.totalSessions ?? 0,
      avgNps: metrics?.avgNps ?? 0,
      avgTraction: metrics?.avgTraction ?? 0,
      networkOpennessRate: metrics?.networkOpennessRate ?? 0,
    }));
  } catch (error) {
    req.log.error({ err: error }, "Failed to load dashboard metrics");
    res.status(503).json(ErrorResponse.parse({
      error: "Não foi possível carregar as métricas do painel agora.",
    }));
  }
});

export default router;