import { asc, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetAccessPermissionsResponse, GetMentorsResponse } from "@workspace/api-zod";
import { db, mentorsTable, mentoringSessionsTable } from "@workspace/db";
import { isAdministrator, requireApprovedUser } from "../middlewares/requireApprovedUser";

const router: IRouter = Router();

router.get("/access", requireApprovedUser, (_req, res): void => {
  const email = res.locals.approvedEmail;
  res.json(GetAccessPermissionsResponse.parse({
    canManage: typeof email === "string" && isAdministrator(email),
  }));
});

router.get("/mentors", requireApprovedUser, async (_req, res): Promise<void> => {
  const mentors = await db
    .select({
      id: mentorsTable.id,
      name: mentorsTable.name,
      email: mentorsTable.email,
      expertiseArea: mentorsTable.expertiseArea,
      mentorType: mentorsTable.mentorType,
      totalSessions: sql<number>`count(${mentoringSessionsTable.id})`.mapWith(Number),
      avgNpsReceived: sql<number | null>`
        round(avg(${mentoringSessionsTable.teamNps})::numeric, 1)::float8
      `,
      assignedTeamsCount: sql<number>`
        count(distinct ${mentoringSessionsTable.teamId})
      `.mapWith(Number),
    })
    .from(mentorsTable)
    .leftJoin(mentoringSessionsTable, sql`${mentoringSessionsTable.mentorId} = ${mentorsTable.id}`)
    .groupBy(mentorsTable.id)
    .orderBy(asc(mentorsTable.name));
  res.json(GetMentorsResponse.parse(mentors));
});

export default router;