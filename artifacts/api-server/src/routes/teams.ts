import { asc, count, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetTeamsResponse } from "@workspace/api-zod";
import { db, mentorsTable, mentoringSessionsTable, teamsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/teams", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: teamsTable.id,
      name: teamsTable.name,
      pitchSummary: teamsTable.pitchSummary,
      currentStage: teamsTable.currentStage,
      createdAt: teamsTable.createdAt,
      mentorId: mentorsTable.id,
      mentorName: mentorsTable.name,
      mentorEmail: mentorsTable.email,
      mentorExpertiseArea: mentorsTable.expertiseArea,
      mentorType: mentorsTable.mentorType,
      sessionCount: count(mentoringSessionsTable.id),
    })
    .from(teamsTable)
    .innerJoin(mentorsTable, eq(teamsTable.mainMentorId, mentorsTable.id))
    .leftJoin(mentoringSessionsTable, eq(mentoringSessionsTable.teamId, teamsTable.id))
    .groupBy(teamsTable.id, mentorsTable.id)
    .orderBy(asc(teamsTable.id));

  res.json(
    GetTeamsResponse.parse(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        pitchSummary: row.pitchSummary,
        currentStage: row.currentStage,
        createdAt: row.createdAt.toISOString(),
        mainMentor: {
          id: row.mentorId,
          name: row.mentorName,
          email: row.mentorEmail,
          expertiseArea: row.mentorExpertiseArea,
          mentorType: row.mentorType,
        },
        sessionCount: row.sessionCount,
      })),
    ),
  );
});

export default router;