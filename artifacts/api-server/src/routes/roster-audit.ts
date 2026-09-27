import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetRosterAuditResponse } from "@workspace/api-zod";
import { db, rosterAuditTable } from "@workspace/db";
import { requireAdministrator, requireApprovedUser } from "../middlewares/requireApprovedUser";

const router: IRouter = Router();

function parseId(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

router.get("/roster-audit", requireApprovedUser, requireAdministrator, async (req, res): Promise<void> => {
  const teamId = parseId(req.query.teamId);
  const studentId = parseId(req.query.studentId);
  if (teamId === null || studentId === null) {
    res.status(400).json({ error: "Informe IDs positivos para filtrar o histórico." });
    return;
  }
  const rows = await db.select().from(rosterAuditTable)
    .where(and(
      teamId === undefined ? undefined : eq(rosterAuditTable.teamId, teamId),
      studentId === undefined ? undefined : eq(rosterAuditTable.studentId, studentId),
    ))
    .orderBy(desc(rosterAuditTable.id)).limit(100);
  res.json(GetRosterAuditResponse.parse(rows));
});

export default router;