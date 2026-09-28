import { and, asc, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateTeamBody,
  CreateTeamResponse,
  CreateMentoringSessionBody,
  CreateMentoringSessionParams,
  CreateMentoringSessionResponse,
  DeleteTeamBody,
  DeleteTeamParams,
  GetTeamSessionsParams,
  GetTeamSessionsResponse,
  UpdateTeamBody,
  UpdateTeamParams,
  UpdateTeamResponse,
} from "@workspace/api-zod";
import {
  db,
  insertStudentSchema,
  insertMentoringSessionSchema,
  insertTeamSchema,
  mentorsTable,
  mentoringSessionsTable,
  rosterAuditTable,
  studentsTable,
  teamsTable,
} from "@workspace/db";
import { readTeams } from "../lib/team-read";
import { rosterWriteLock } from "../lib/roster-lock";
import { requireAdministrator, requireApprovedUser } from "../middlewares/requireApprovedUser";

const router: IRouter = Router();

function isDatabaseError(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === code) return true;
  return "cause" in error && isDatabaseError(error.cause, code);
}

router.get("/teams/:teamId/sessions", requireApprovedUser, async (req, res): Promise<void> => {
  const params = GetTeamSessionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "O identificador da equipe é inválido." });
    return;
  }

  const result = await (async () => {
    const [team] = await db
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.id, params.data.teamId))
      .limit(1);
    if (!team) return { status: "not-found" as const };

    const sessions = await db
      .select({
        id: mentoringSessionsTable.id,
        sessionDate: mentoringSessionsTable.sessionDate,
        sessionType: mentoringSessionsTable.sessionType,
        mentorId: mentorsTable.id,
        mentorName: mentorsTable.name,
        mentorExpertiseArea: mentorsTable.expertiseArea,
        mentorType: mentorsTable.mentorType,
        teamNps: mentoringSessionsTable.teamNps,
        teamActionability: mentoringSessionsTable.teamActionability,
        mentorCommitment: mentoringSessionsTable.mentorCommitment,
        mentorTraction: mentoringSessionsTable.mentorTraction,
        teamFeedbackStrongPoints: mentoringSessionsTable.teamFeedbackStrongPoints,
        teamFeedbackImprovements: mentoringSessionsTable.teamFeedbackImprovements,
        agreedNextSteps: mentoringSessionsTable.agreedNextSteps,
        mentorQualitativeAssessment: mentoringSessionsTable.mentorQualitativeAssessment,
        createdAt: mentoringSessionsTable.createdAt,
      })
      .from(mentoringSessionsTable)
      .innerJoin(mentorsTable, eq(mentorsTable.id, mentoringSessionsTable.mentorId))
      .where(eq(mentoringSessionsTable.teamId, params.data.teamId))
      .orderBy(
        desc(mentoringSessionsTable.sessionDate),
        desc(mentoringSessionsTable.createdAt),
        desc(mentoringSessionsTable.id),
      );
    return { status: "loaded" as const, sessions };
  })().catch((error: unknown) => {
    req.log.error({ err: error, teamId: params.data.teamId }, "Failed to load team session history");
    return { status: "unavailable" as const };
  });

  if (result.status === "unavailable") {
    res.status(503).json({ error: "Não foi possível carregar o histórico de sessões agora." });
    return;
  }
  if (result.status === "not-found") {
    res.status(404).json({ error: "Equipe não encontrada." });
    return;
  }

  const history = result.sessions.map((session) => ({
    id: session.id,
    sessionDate: session.sessionDate,
    sessionType: session.sessionType,
    mentor: {
      id: session.mentorId,
      name: session.mentorName,
      expertiseArea: session.mentorExpertiseArea,
      mentorType: session.mentorType,
    },
    scores: {
      teamNps: session.teamNps,
      teamActionability: session.teamActionability,
      mentorCommitment: session.mentorCommitment,
      mentorTraction: session.mentorTraction,
    },
    qualitative: {
      teamFeedbackStrongPoints: session.teamFeedbackStrongPoints,
      teamFeedbackImprovements: session.teamFeedbackImprovements,
      agreedNextSteps: session.agreedNextSteps,
      mentorQualitativeAssessment: session.mentorQualitativeAssessment,
    },
    createdAt: session.createdAt.toISOString(),
  }));

  // Validate the date-only contract but preserve the original YYYY-MM-DD strings in the JSON response.
  GetTeamSessionsResponse.parse(history);
  res.json(history);
});

router.post("/teams/:teamId/sessions", requireApprovedUser, requireAdministrator, async (req, res): Promise<void> => {
  const params = CreateMentoringSessionParams.safeParse(req.params);
  const body = CreateMentoringSessionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Informe os dados da sessão em formato válido." });
    return;
  }
  const sessionData = insertMentoringSessionSchema.safeParse({
    ...body.data,
    teamId: params.data.teamId,
    // The generated OpenAPI validator coerces date strings to Date.
    // Re-validate the original full-date string with the DB schema.
    sessionDate: req.body.sessionDate,
  });
  if (!sessionData.success) {
    res.status(400).json({ error: "A data, as notas ou os relatos da sessão estão inválidos." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(rosterWriteLock);
      const [team] = await tx
        .select({ id: teamsTable.id })
        .from(teamsTable)
        .where(eq(teamsTable.id, params.data.teamId))
        .for("update");
      if (!team) return { status: "not-found" } as const;

      const [mentor] = await tx
        .select({ id: mentorsTable.id })
        .from(mentorsTable)
        .where(eq(mentorsTable.id, body.data.mentorId))
        .limit(1);
      if (!mentor) return { status: "invalid-mentor" } as const;

      const [session] = await tx
        .insert(mentoringSessionsTable)
        .values({ ...sessionData.data, teamId: team.id })
        .returning();
      return { status: "created", session } as const;
    });

    if (result.status === "not-found") {
      res.status(404).json({ error: "Equipe não encontrada." });
      return;
    }
    if (result.status === "invalid-mentor") {
      res.status(400).json({ error: "O mentor selecionado não existe." });
      return;
    }

    const response = CreateMentoringSessionResponse.parse(result.session);
    req.log.info({ teamId: result.session.teamId, sessionId: result.session.id }, "Mentoring session recorded");
    res.status(201).json({ ...response, sessionDate: result.session.sessionDate });
  } catch (error) {
    if (isDatabaseError(error, "23503")) {
      res.status(400).json({ error: "A equipe ou o mentor selecionado não está mais disponível." });
      return;
    }
    throw error;
  }
});

router.post("/teams", requireApprovedUser, requireAdministrator, async (req, res): Promise<void> => {
  const body = CreateTeamBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Informe o nome da equipe, um mentor e os estudantes em formato válido." });
    return;
  }

  const name = body.data.name.trim();
  const students = body.data.students.map((student) => student.trim());
  if (!name || students.some((student) => !student)) {
    res.status(400).json({ error: "Nomes da equipe e dos estudantes não podem estar vazios." });
    return;
  }

  try {
    const teamId = await db.transaction(async (tx) => {
      await tx.execute(rosterWriteLock);
      const [mentor] = await tx
        .select({ id: mentorsTable.id })
        .from(mentorsTable)
        .where(eq(mentorsTable.id, body.data.mainMentorId))
        .limit(1);
      if (!mentor) return null;

      const [team] = await tx
        .insert(teamsTable)
        .values(insertTeamSchema.parse({
          name,
          mainMentorId: mentor.id,
          pitchSummary: null,
          currentStage: null,
        }))
        .returning({ id: teamsTable.id });

      if (students.length) {
        const createdStudents = await tx.insert(studentsTable).values(students.map((student, sortOrder) =>
          insertStudentSchema.parse({ teamId: team.id, name: student, sortOrder })
        )).returning({ id: studentsTable.id });
        await tx.insert(rosterAuditTable).values(createdStudents.map((student) => ({
          teamId: team.id, studentId: student.id, action: "student.created",
          actorEmail: res.locals.approvedEmail, summary: "Estudante incluído na criação da equipe.",
        })));
      }
      await tx.insert(rosterAuditTable).values({
        teamId: team.id, action: "team.created", actorEmail: res.locals.approvedEmail,
        summary: `Equipe criada; mentor responsável #${mentor.id}; ${students.length} estudante(s) inicial(is).`,
      });
      return team.id;
    });

    if (teamId === null) {
      res.status(400).json({ error: "O mentor selecionado não existe." });
      return;
    }

    const [team] = await readTeams(teamId);
    req.log.info({ teamId }, "Team created");
    CreateTeamResponse.parse(team);
    res.status(201).json(team);
  } catch (error) {
    if (isDatabaseError(error, "23505")) {
      res.status(409).json({ error: "Já existe uma equipe com esse nome." });
      return;
    }
    if (isDatabaseError(error, "23503")) {
      res.status(400).json({ error: "O mentor selecionado não está mais disponível." });
      return;
    }
    throw error;
  }
});

router.patch("/teams/:teamId", requireApprovedUser, requireAdministrator, async (req, res): Promise<void> => {
  const params = UpdateTeamParams.safeParse(req.params);
  const body = UpdateTeamBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Dados da equipe inválidos." });
    return;
  }

  const updates: { name?: string; mainMentorId?: number } = {};
  if (body.data.name !== undefined) {
    updates.name = body.data.name.trim();
    if (!updates.name) {
      res.status(400).json({ error: "O nome da equipe não pode estar vazio." });
      return;
    }
  }
  if (body.data.mainMentorId !== undefined) {
    updates.mainMentorId = body.data.mainMentorId;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Informe ao menos uma alteração." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(rosterWriteLock);
      if (updates.mainMentorId !== undefined) {
        const [mentor] = await tx
          .select({ id: mentorsTable.id })
          .from(mentorsTable)
          .where(eq(mentorsTable.id, updates.mainMentorId))
          .limit(1);
        if (!mentor) return { status: "invalid-mentor" } as const;
      }

      const [updated] = await tx
        .update(teamsTable)
        .set(updates)
        .where(and(
          eq(teamsTable.id, params.data.teamId),
          eq(teamsTable.name, body.data.expectedName),
          eq(teamsTable.mainMentorId, body.data.expectedMainMentorId),
        ))
        .returning({ id: teamsTable.id });
      if (updated) {
        const changes = [
          ...(updates.name !== undefined && updates.name !== body.data.expectedName ? ["nome da equipe alterado"] : []),
          ...(updates.mainMentorId !== undefined && updates.mainMentorId !== body.data.expectedMainMentorId
            ? [`mentor responsável #${body.data.expectedMainMentorId} → #${updates.mainMentorId}`] : []),
        ];
        if (changes.length) {
          await tx.insert(rosterAuditTable).values({
            teamId: updated.id, action: updates.mainMentorId !== undefined && updates.mainMentorId !== body.data.expectedMainMentorId ? "team.mentor_changed" : "team.updated",
            actorEmail: res.locals.approvedEmail, summary: changes.join("; ") + ".",
          });
        }
        return { status: "updated", id: updated.id } as const;
      }

      const [existing] = await tx
        .select({ id: teamsTable.id })
        .from(teamsTable)
        .where(eq(teamsTable.id, params.data.teamId))
        .limit(1);
      return { status: existing ? "conflict" : "not-found" } as const;
    });

    if (result.status === "invalid-mentor") {
      res.status(400).json({ error: "O mentor selecionado não existe." });
      return;
    }
    if (result.status === "not-found") {
      res.status(404).json({ error: "Equipe não encontrada." });
      return;
    }
    if (result.status === "conflict") {
      res.status(409).json({ error: "A equipe mudou em outra sessão. Atualize a relação antes de salvar novamente." });
      return;
    }

    const [team] = await readTeams(result.id);
    req.log.info({ teamId: result.id }, "Team updated");
    UpdateTeamResponse.parse(team);
    res.json(team);
  } catch (error) {
    if (isDatabaseError(error, "23505")) {
      res.status(409).json({ error: "Já existe uma equipe com esse nome." });
      return;
    }
    if (isDatabaseError(error, "23503")) {
      res.status(400).json({ error: "O mentor selecionado não está mais disponível." });
      return;
    }
    throw error;
  }
});

router.delete("/teams/:teamId", requireApprovedUser, requireAdministrator, async (req, res): Promise<void> => {
  const params = DeleteTeamParams.safeParse(req.params);
  const body = DeleteTeamBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Dados de confirmação da equipe inválidos." });
    return;
  }

  const teamId = params.data.teamId;
  const expectedStudents = [...body.data.expectedStudents].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  );
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(rosterWriteLock);
    const [team] = await tx
      .select({ id: teamsTable.id, name: teamsTable.name, mainMentorId: teamsTable.mainMentorId })
      .from(teamsTable)
      .where(eq(teamsTable.id, teamId))
      .for("update");
    if (!team) return "not-found" as const;

    const currentStudents = await tx
      .select({ id: studentsTable.id, name: studentsTable.name, sortOrder: studentsTable.sortOrder })
      .from(studentsTable)
      .where(eq(studentsTable.teamId, teamId))
      .orderBy(asc(studentsTable.sortOrder), asc(studentsTable.id));
    if (
      team.name !== body.data.expectedName ||
      team.mainMentorId !== body.data.expectedMainMentorId ||
      currentStudents.length !== expectedStudents.length ||
      currentStudents.some((student, index) =>
        student.id !== expectedStudents[index].id ||
        student.name !== expectedStudents[index].name ||
        student.sortOrder !== expectedStudents[index].sortOrder
      )
    ) return "conflict" as const;

    // The DB relationship cascades sessions: never remove them as a side effect here.
    const [session] = await tx
      .select({ id: mentoringSessionsTable.id })
      .from(mentoringSessionsTable)
      .where(eq(mentoringSessionsTable.teamId, teamId))
      .limit(1);
    if (session) return "has-sessions" as const;

    await tx.delete(teamsTable).where(eq(teamsTable.id, teamId));
    await tx.insert(rosterAuditTable).values([
      { teamId, action: "team.deleted", actorEmail: res.locals.approvedEmail,
        summary: `Equipe excluída com ${currentStudents.length} estudante(s).` },
      ...currentStudents.map((student) => ({
        teamId, studentId: student.id, action: "student.deleted",
        actorEmail: res.locals.approvedEmail, summary: "Estudante removido pela exclusão da equipe.",
      })),
    ]);
    return "deleted" as const;
  });

  if (outcome === "not-found") {
    res.status(404).json({ error: "Equipe não encontrada." });
    return;
  }
  if (outcome === "conflict") {
    res.status(409).json({ error: "A equipe ou seus estudantes mudaram desde a confirmação. Atualize a relação e confira novamente antes de excluir." });
    return;
  }
  if (outcome === "has-sessions") {
    res.status(409).json({ error: "Essa equipe possui sessões registradas e não pode ser removida." });
    return;
  }
  req.log.info({ teamId }, "Team deleted");
  res.status(204).end();
});

export default router;