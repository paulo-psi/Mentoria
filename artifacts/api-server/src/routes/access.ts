import { asc, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateMentorBody,
  CreateMentorResponse,
  GetAccessPermissionsResponse,
  GetMentorsResponse,
} from "@workspace/api-zod";
import { db, insertMentorSchema, mentorsTable, mentoringSessionsTable, rosterAuditTable } from "@workspace/db";
import { rosterWriteLock } from "../lib/roster-lock";
import { isAdministrator, requireAdministrator, requireApprovedUser } from "../middlewares/requireApprovedUser";

const router: IRouter = Router();

function isDatabaseError(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === code) return true;
  return "cause" in error && isDatabaseError(error.cause, code);
}

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

router.post("/mentors", requireApprovedUser, requireAdministrator, async (req, res): Promise<void> => {
  const body = CreateMentorBody.safeParse(req.body);
  const name = body.success ? body.data.name.trim() : "";
  if (!body.success || !name) {
    res.status(400).json({ error: "Informe um nome válido para o mentor." });
    return;
  }

  const email = body.data.email?.trim().toLowerCase() || null;
  const expertiseArea = body.data.expertiseArea?.trim() || null;
  const mentorInput = insertMentorSchema.parse({
    name,
    email,
    expertiseArea,
    mentorType: body.data.mentorType ?? null,
  });

  try {
    const mentor = await db.transaction(async (tx) => {
      await tx.execute(rosterWriteLock);
      const [created] = await tx.insert(mentorsTable).values(mentorInput).returning();
      await tx.insert(rosterAuditTable).values({
        teamId: null,
        studentId: null,
        mentorId: created.id,
        action: "mentor.created",
        actorEmail: res.locals.approvedEmail,
        summary: `Mentor cadastrado: ${created.name}.`,
      });
      return created;
    });

    const response = CreateMentorResponse.parse({
      id: mentor.id,
      name: mentor.name,
      email: mentor.email,
      expertiseArea: mentor.expertiseArea,
      mentorType: mentor.mentorType,
      totalSessions: 0,
      avgNpsReceived: null,
      assignedTeamsCount: 0,
    });
    req.log.info({ mentorId: mentor.id }, "Mentor created");
    res.status(201).json(response);
  } catch (error) {
    if (isDatabaseError(error, "23505")) {
      res.status(409).json({ error: "Já existe um mentor cadastrado com esse e-mail." });
      return;
    }
    throw error;
  }
});

export default router;