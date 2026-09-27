import { asc, count, eq } from "drizzle-orm";
import { db, mentorsTable, mentoringSessionsTable, studentsTable, teamsTable } from "@workspace/db";

export async function readTeams(teamId?: number) {
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
    .where(teamId === undefined ? undefined : eq(teamsTable.id, teamId))
    .groupBy(teamsTable.id, mentorsTable.id)
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
  }));
}