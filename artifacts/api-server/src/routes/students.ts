import { and, asc, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateStudentBody,
  CreateStudentParams,
  CreateStudentResponse,
  DeleteStudentBody,
  DeleteStudentParams,
  UpdateStudentBody,
  UpdateStudentParams,
  UpdateStudentResponse,
} from "@workspace/api-zod";
import { db, insertStudentSchema, rosterAuditTable, studentsTable, teamsTable } from "@workspace/db";
import { rosterWriteLock } from "../lib/roster-lock";
import { requireAdministrator, requireApprovedUser } from "../middlewares/requireApprovedUser";

const router: IRouter = Router();

router.post("/teams/:teamId/students", requireApprovedUser, requireAdministrator, async (req, res): Promise<void> => {
  const params = CreateStudentParams.safeParse(req.params);
  const body = CreateStudentBody.safeParse(req.body);
  if (!params.success || !body.success || !body.data.name.trim()) {
    res.status(400).json({ error: "Informe um nome válido para o estudante." });
    return;
  }
  const teamId = params.data.teamId;
  const name = body.data.name.trim();

  const student = await db.transaction(async (tx) => {
    await tx.execute(rosterWriteLock);
    const [team] = await tx
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.id, teamId))
      .for("update");
    if (!team) return null;

    const [last] = await tx
      .select({ sortOrder: studentsTable.sortOrder })
      .from(studentsTable)
      .where(eq(studentsTable.teamId, teamId))
      .orderBy(desc(studentsTable.sortOrder))
      .limit(1);

    const [created] = await tx
      .insert(studentsTable)
      .values(insertStudentSchema.parse({
        teamId,
        name,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      }))
      .returning();
    await tx.insert(rosterAuditTable).values({
      teamId, studentId: created.id, action: "student.created",
      actorEmail: res.locals.approvedEmail, summary: "Estudante incluído na equipe.",
    });
    return created;
  });

  if (!student) {
    res.status(404).json({ error: "Equipe não encontrada." });
    return;
  }
  req.log.info({ teamId, studentId: student.id }, "Student added");
  res.status(201).json(CreateStudentResponse.parse(student));
});

router.patch("/teams/:teamId/students/:studentId", requireApprovedUser, requireAdministrator, async (req, res): Promise<void> => {
  const params = UpdateStudentParams.safeParse(req.params);
  const body = UpdateStudentBody.safeParse(req.body);
  if (!params.success || !body.success || !body.data.name.trim()) {
    res.status(400).json({ error: "Informe um nome válido para o estudante." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(rosterWriteLock);
    const [student] = await tx
      .update(studentsTable)
      .set({ name: body.data.name.trim() })
      .where(and(
        eq(studentsTable.id, params.data.studentId),
        eq(studentsTable.teamId, params.data.teamId),
        eq(studentsTable.name, body.data.expectedName),
      ))
      .returning();
    if (student) {
      if (student.name !== body.data.expectedName) {
        await tx.insert(rosterAuditTable).values({
          teamId: params.data.teamId, studentId: student.id, action: "student.updated",
          actorEmail: res.locals.approvedEmail, summary: "Nome do estudante alterado.",
        });
      }
      return { status: "updated", student } as const;
    }

    const [existing] = await tx
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(and(
        eq(studentsTable.id, params.data.studentId),
        eq(studentsTable.teamId, params.data.teamId),
      ))
      .limit(1);
    return { status: existing ? "conflict" : "not-found" } as const;
  });

  if (result.status === "updated") {
    req.log.info({ teamId: params.data.teamId, studentId: result.student.id }, "Student updated");
    res.json(UpdateStudentResponse.parse(result.student));
    return;
  }
  if (result.status === "conflict") {
    res.status(409).json({ error: "O estudante mudou em outra sessão. Atualize a relação antes de salvar novamente." });
    return;
  }
  res.status(404).json({ error: "Estudante não encontrado nessa equipe." });
});

router.delete("/teams/:teamId/students/:studentId", requireApprovedUser, requireAdministrator, async (req, res): Promise<void> => {
  const params = DeleteStudentParams.safeParse(req.params);
  const body = DeleteStudentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Dados de confirmação do estudante inválidos." });
    return;
  }
  const { teamId, studentId } = params.data;

  const outcome = await db.transaction(async (tx) => {
    await tx.execute(rosterWriteLock);
    const [team] = await tx
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.id, teamId))
      .for("update");
    if (!team) return "not-found" as const;

    const [student] = await tx
      .delete(studentsTable)
      .where(and(
        eq(studentsTable.id, studentId),
        eq(studentsTable.teamId, teamId),
        eq(studentsTable.name, body.data.expectedName),
      ))
      .returning({ id: studentsTable.id });
    if (!student) {
      const [existing] = await tx
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(and(eq(studentsTable.id, studentId), eq(studentsTable.teamId, teamId)))
        .limit(1);
      return existing ? "conflict" as const : "not-found" as const;
    }

    const remaining = await tx
      .select({ id: studentsTable.id, sortOrder: studentsTable.sortOrder })
      .from(studentsTable)
      .where(eq(studentsTable.teamId, teamId))
      .orderBy(asc(studentsTable.sortOrder), asc(studentsTable.id));
    for (const [sortOrder, member] of remaining.entries()) {
      if (member.sortOrder !== sortOrder) {
        await tx.update(studentsTable)
          .set({ sortOrder })
          .where(eq(studentsTable.id, member.id));
      }
    }
    await tx.insert(rosterAuditTable).values({
      teamId, studentId, action: "student.deleted",
      actorEmail: res.locals.approvedEmail, summary: "Estudante removido da equipe.",
    });
    return "deleted" as const;
  });

  if (outcome === "not-found") {
    res.status(404).json({ error: "Estudante não encontrado nessa equipe." });
    return;
  }
  if (outcome === "conflict") {
    res.status(409).json({ error: "O estudante mudou desde a confirmação. Atualize a relação e confira novamente antes de remover." });
    return;
  }
  req.log.info({ teamId, studentId }, "Student deleted");
  res.status(204).end();
});

export default router;