import { asc, count, desc, eq, sql } from "drizzle-orm";
import { db, mentorsTable, mentoringSessionsTable, studentsTable, teamsTable } from "@workspace/db";

export async function readTeams(teamId?: number) {
  const sessionSummary = db
    .select({
      teamId: mentoringSessionsTable.teamId,
      totalSessions: count(mentoringSessionsTable.id).as("total_sessions"),
      transversalSessionCount: sql<number>`
        count(*) filter (
          where ${mentoringSessionsTable.sessionType} in ('transversal', 'externo')
        )
      `.mapWith(Number).as("transversal_session_count"),
    })
    .from(mentoringSessionsTable)
    .groupBy(mentoringSessionsTable.teamId)
    .as("session_summary");

  const latestSession = db
    .selectDistinctOn([mentoringSessionsTable.teamId], {
      teamId: mentoringSessionsTable.teamId,
      sessionDate: mentoringSessionsTable.sessionDate,
      teamNps: mentoringSessionsTable.teamNps,
      agreedNextSteps: mentoringSessionsTable.agreedNextSteps,
    })
    .from(mentoringSessionsTable)
    .orderBy(
      mentoringSessionsTable.teamId,
      desc(mentoringSessionsTable.sessionDate),
      desc(mentoringSessionsTable.createdAt),
      desc(mentoringSessionsTable.id),
    )
    .as("latest_session");

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
      sessionCount: sql<number>`coalesce(${sessionSummary.totalSessions}, 0)`.mapWith(Number),
      totalSessions: sql<number>`coalesce(${sessionSummary.totalSessions}, 0)`.mapWith(Number),
      transversalSessionCount: sql<number>`
        coalesce(${sessionSummary.transversalSessionCount}, 0)
      `.mapWith(Number),
      lastSessionDate: latestSession.sessionDate,
      lastSessionScore: latestSession.teamNps,
      latestAgreedNextSteps: latestSession.agreedNextSteps,
    })
    .from(teamsTable)
    .innerJoin(mentorsTable, eq(teamsTable.mainMentorId, mentorsTable.id))
    .leftJoin(sessionSummary, eq(sessionSummary.teamId, teamsTable.id))
    .leftJoin(latestSession, eq(latestSession.teamId, teamsTable.id))
    .where(teamId === undefined ? undefined : eq(teamsTable.id, teamId))
    .orderBy(asc(teamsTable.id));

  const studentRows = await db
    .select({
      teamId: studentsTable.teamId,
      id: studentsTable.id,
      name: studentsTable.name,
      sortOrder: studentsTable.sortOrder,
    })
    .from(studentsTable)
    .where(teamId === undefined ? undefined : eq(studentsTable.teamId, teamId))
    .orderBy(asc(studentsTable.teamId), asc(studentsTable.sortOrder));

  const studentsByTeam = new Map<number, typeof studentRows>();
  for (const student of studentRows) {
    const members = studentsByTeam.get(student.teamId) ?? [];
    members.push(student);
    studentsByTeam.set(student.teamId, members);
  }

  return rows.map((row) => ({
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
    students: (studentsByTeam.get(row.id) ?? []).map(({ id, name, sortOrder }) => ({
      id,
      name,
      sortOrder,
    })),
    sessionCount: row.sessionCount,
    totalSessions: row.totalSessions,
    transversalSessionCount: row.transversalSessionCount,
    lastSessionDate: row.lastSessionDate,
    lastSessionScore: row.lastSessionScore,
    latestAgreedNextSteps: row.latestAgreedNextSteps,
  }));
}