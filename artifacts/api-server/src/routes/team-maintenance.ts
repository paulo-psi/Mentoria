import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateTeamBody,
  CreateTeamResponse,
  DeleteTeamBody,
  DeleteTeamParams,
  UpdateTeamBody,
  UpdateTeamParams,
  UpdateTeamResponse,
} from "@workspace/api-zod";
import {
  db,
  insertStudentSchema,
  insertTeamSchema,
  mentorsTable,
  mentoringSessionsTable,
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
        await tx.insert(studentsTable).values(students.map((student, sortOrder) =>
          insertStudentSchema.parse({ teamId: team.id, name: student, sortOrder })
        ));
      }
      return team.id;
    });

    if (teamId === null) {
      res.status(400).json({ error: "O mentor selecionado não existe." });
      return;
    }

    const [team] = await readTeams(teamId);
    req.log.info({ teamId }, "Team created");
    res.status(201).json(CreateTeamResponse.parse(team));
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
      if (updated) return { status: "updated", id: updated.id } as const;

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
    res.json(UpdateTeamResponse.parse(team));
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