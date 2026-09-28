import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, mock, test } from "node:test";
import type { Server } from "node:http";
import path from "node:path";
import express from "express";
import { clerkClient } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import {
  db, pool, mentorsTable, mentoringSessionsTable, studentsTable, teamsTable,
} from "@workspace/db";
import teamRoutes from "../src/routes/team-maintenance";
import studentRoutes from "../src/routes/students";
import listRoutes from "../src/routes/teams";
import { officialTeams } from "../src/official-data";
import { seedDatabase } from "../src/seed";
import { logger } from "../src/lib/logger";

const ADMIN = "admin@test.invalid";
const READER = "reader@test.invalid";
process.env.HUB_ADMIN_EMAILS = ADMIN;
process.env.HUB_ALLOWED_EMAILS = READER;
process.env.LOG_LEVEL = "silent";

// Only identity resolution is stubbed: the real approval and administrator
// middlewares run on every request, without contacting Clerk's network API.
mock.method(clerkClient.users, "getUser", async (userId: string) => ({
  primaryEmailAddress: {
    emailAddress: userId === "admin" ? ADMIN : userId === "reader" ? READER : "other@test.invalid",
    verification: { status: "verified" },
  },
}));

let server: Server | undefined;
let baseUrl = "";

async function start() {
  // Matches the startup order in src/index.ts, with a local identity shim in
  // place of Clerk's token verification. No production HTTP server is used.
  await seedDatabase();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.header("x-test-user");
    const auth = Object.assign(() => ({ userId: userId ?? null, tokenType: "session_token" }), {
      [Symbol.for("@clerk/express.auth")]: true,
    });
    (req as typeof req & { auth: typeof auth }).auth = auth;
    req.log = logger;
    next();
  });
  app.use("/api", listRoutes, teamRoutes, studentRoutes);
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local test port");
  baseUrl = `http://127.0.0.1:${address.port}/api`;
}

async function stop() {
  if (!server) return;
  const current = server;
  server = undefined;
  await new Promise<void>((resolve, reject) => current.close((error) => error ? reject(error) : resolve()));
}

after(async () => {
  await stop();
  await pool.end();
});

type Team = {
  id: number;
  name: string;
  mainMentor: { id: number; name: string };
  students: { id: number; name: string; sortOrder: number }[];
  sessionCount: number;
};

async function request(
  method: string, path: string, body?: unknown, user?: "admin" | "reader" | "other",
) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(user ? { "x-test-user": user } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  assert.ok(!text || response.headers.get("content-type")?.includes("application/json"), `${method} ${path}: ${response.status} ${text.slice(0, 500)}`);
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function teams(): Promise<Team[]> {
  const response = await request("GET", "/teams", undefined, "admin");
  assert.equal(response.status, 200);
  return response.body as Team[];
}

function confirmation(team: Team) {
  return {
    expectedName: team.name,
    expectedMainMentorId: team.mainMentor.id,
    expectedStudents: team.students.map(({ id, name, sortOrder }) => ({ id, name, sortOrder })),
  };
}

type OfficialEntry = {
  numero: number;
  mentor: string;
  equipe: string;
  integrantes: string[];
};

async function officialRoster(): Promise<OfficialEntry[]> {
  // This checked-in attachment is the source document, not a projection of
  // officialTeams: changes to either the seed data or the API must be noticed.
  const document = JSON.parse(await readFile(path.resolve(
    process.cwd(),
    "../../attached_assets/Pasted--programa-PIBEP-edicao-16-edi-o-ano-2026-titulo-documen_1790526119463.txt",
  ), "utf8")) as {
    programa: string; edicao: string; ano: number; equipes: OfficialEntry[];
  };
  assert.equal(document.programa, "PIBEP");
  assert.equal(document.edicao, "16ª edição");
  assert.equal(document.ano, 2026);
  assert.equal(document.equipes.length, 8);
  assert.deepEqual(document.equipes.map(({ numero }) => numero), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(document.equipes.reduce((total, team) => total + team.integrantes.length, 0), 29);
  assert.equal(new Set(document.equipes.map(({ mentor }) => mentor)).size, 8);
  assert.equal(new Set(document.equipes.map(({ equipe }) => equipe)).size, 8);

  const text = (await readFile(path.resolve(
    process.cwd(),
    "../../attached_assets/Pasted-Considere-os-dados-abaixo-como-a-rela-o-oficial-entre-m_1790526154609.txt",
  ), "utf8")).replace(/\r\n/g, "\n");
  const listed = [...text.matchAll(
    /(\d+)\. Mentor\(a\): ([^\n]+)\n   Equipe: ([^\n]+)\n   Integrantes:\n((?:   - [^\n]+\n?)+)/g,
  )].map(([, numero, mentor, equipe, members]) => ({
    numero: Number(numero),
    mentor,
    equipe,
    integrantes: [...members.matchAll(/^   - (.+)$/gm)].map(([, name]) => name),
  }));
  assert.deepEqual(listed, document.equipes, "both official attachments must agree");
  return document.equipes;
}

function rosterProjection(rows: Team[]) {
  return rows.map((team) => ({
    equipe: team.name,
    mentor: team.mainMentor.name,
    integrantes: team.students.map(({ name }) => name),
    ordens: team.students.map(({ sortOrder }) => sortOrder),
    sessoes: team.sessionCount,
  }));
}

test("official document, seed and API agree on every mentor, team, student and order", async () => {
  const expected = await officialRoster();
  assert.deepEqual(officialTeams.map(({ name, mentor, students }) => ({
    equipe: name, mentor, integrantes: [...students],
  })), expected.map(({ equipe, mentor, integrantes }) => ({ equipe, mentor, integrantes })));

  await start();
  try {
    const first = await teams();
    const expectedRoster = expected.map(({ equipe, mentor, integrantes }) => ({
      equipe, mentor, integrantes,
      ordens: integrantes.map((_, index) => index),
      sessoes: 0,
    }));
    assert.deepEqual(rosterProjection(first), expectedRoster, "API must return all official pairs and ordered names");

    const mentors = await db.select().from(mentorsTable);
    const storedTeams = await db.select().from(teamsTable);
    const students = await db.select().from(studentsTable);
    assert.equal(mentors.length, 8, "no additional or missing mentors");
    assert.equal(storedTeams.length, 8, "no additional or missing teams");
    assert.equal(students.length, 29, "no additional, missing or duplicated students");
    assert.deepEqual(await db.select().from(mentoringSessionsTable), [], "seed must not invent sessions");
    assert.deepEqual(
      [...storedTeams].sort((a, b) => a.id - b.id).map((team) => ({
        equipe: team.name,
        mentor: mentors.find(({ id }) => id === team.mainMentorId)?.name,
        integrantes: students.filter(({ teamId }) => teamId === team.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(({ name, sortOrder }) => ({ name, sortOrder })),
      })),
      expected.map(({ equipe, mentor, integrantes }) => ({
        equipe, mentor, integrantes: integrantes.map((name, sortOrder) => ({ name, sortOrder })),
      })),
      "database links and positions must agree with the source document",
    );

    await seedDatabase();
    assert.deepEqual(await teams(), first, "second seed must not change API rows or identifiers");
    assert.deepEqual(await db.select().from(mentorsTable), mentors, "second seed must preserve mentors");
    assert.deepEqual(await db.select().from(teamsTable), storedTeams, "second seed must preserve teams");
    assert.deepEqual(await db.select().from(studentsTable), students, "second seed must preserve students");
    assert.deepEqual(await db.select().from(mentoringSessionsTable), [], "second seed must not add sessions");
  } finally {
    await stop();
  }
});

test("roster writes survive boot; permissions and stale confirmations protect data", async () => {
  await start();
  try {
    const original = await teams();
    assert.ok(original.length > 1, "official seed must populate the isolated database");
    const originalTeam = original[0];
    const originalStudent = originalTeam.students[0];
    assert.ok(originalStudent);
    const otherMentorId = original.find((team) => team.mainMentor.id !== originalTeam.mainMentor.id)!.mainMentor.id;

    const writeCases = [
      ["POST", "/teams", { name: "Bloqueada", mainMentorId: otherMentorId, students: [] }],
      ["PATCH", `/teams/${originalTeam.id}`, { ...confirmation(originalTeam), name: "Bloqueada" }],
      ["DELETE", `/teams/${originalTeam.id}`, confirmation(originalTeam)],
      ["POST", `/teams/${originalTeam.id}/students`, { name: "Bloqueado" }],
      ["PATCH", `/teams/${originalTeam.id}/students/${originalStudent.id}`, { expectedName: originalStudent.name, name: "Bloqueado" }],
      ["DELETE", `/teams/${originalTeam.id}/students/${originalStudent.id}`, { expectedName: originalStudent.name }],
    ] as const;
    for (const [method, path, body] of writeCases) {
      assert.equal((await request(method, path, body)).status, 401, `${method} ${path}: no session`);
      assert.equal((await request(method, path, body, "reader")).status, 403, `${method} ${path}: reader`);
      assert.equal((await request(method, path, body, "other")).status, 403, `${method} ${path}: unapproved`);
    }
    assert.deepEqual(await teams(), original, "rejected requests must not write");

    const created = await request("POST", "/teams", {
      name: "Equipe temporária", mainMentorId: originalTeam.mainMentor.id, students: ["Inicial"],
    }, "admin");
    assert.equal(created.status, 201);
    const newTeam = created.body as Team;
    const added = await request("POST", `/teams/${originalTeam.id}/students`, { name: "Nova integrante" }, "admin");
    assert.equal(added.status, 201);
    const newStudent = added.body as { id: number; name: string };
    const renamed = await request("PATCH", `/teams/${originalTeam.id}/students/${newStudent.id}`, {
      expectedName: newStudent.name, name: "Integrante renomeada",
    }, "admin");
    assert.equal(renamed.status, 200);
    assert.equal((await request("PATCH", `/teams/${originalTeam.id}/students/${newStudent.id}`, {
      expectedName: newStudent.name, name: "Perdida",
    }, "admin")).status, 409);
    assert.equal((await request("DELETE", `/teams/${originalTeam.id}/students/${newStudent.id}`, {
      expectedName: newStudent.name,
    }, "admin")).status, 409);

    const changedTeam = await request("PATCH", `/teams/${originalTeam.id}`, {
      ...confirmation(originalTeam), name: "Equipe atualizada", mainMentorId: otherMentorId,
    }, "admin");
    assert.equal(changedTeam.status, 200);
    assert.equal((changedTeam.body as Team).mainMentor.id, otherMentorId);
    assert.equal((await request("PATCH", `/teams/${originalTeam.id}`, {
      ...confirmation(originalTeam), name: "Sobrescrita",
    }, "admin")).status, 409);
    assert.equal((await request("DELETE", `/teams/${originalTeam.id}`, confirmation(originalTeam), "admin")).status, 409);

    const current = (await teams()).find((team) => team.id === originalTeam.id)!;
    assert.equal((await request("DELETE", `/teams/${originalTeam.id}`, {
      ...confirmation(current), expectedStudents: originalTeam.students,
    }, "admin")).status, 409, "old student list cannot confirm team deletion");
    assert.equal((await request("DELETE", `/teams/${originalTeam.id}/students/${originalStudent.id}`, {
      expectedName: originalStudent.name,
    }, "admin")).status, 204);
    assert.equal((await request("DELETE", `/teams/${newTeam.id}`, confirmation(newTeam), "admin")).status, 204);
    assert.equal((await request("DELETE", `/teams/${newTeam.id}`, confirmation(newTeam), "admin")).status, 404);

    const protectedTeam = await request("POST", "/teams", {
      name: "Equipe com sessão", mainMentorId: otherMentorId, students: [],
    }, "admin");
    assert.equal(protectedTeam.status, 201);
    const protectedId = (protectedTeam.body as Team).id;
    await db.insert(mentoringSessionsTable).values({
      teamId: protectedId, mentorId: otherMentorId, sessionType: "principal",
      sessionDate: "2026-01-01", teamNps: 8, teamActionability: 8,
      mentorCommitment: 8, mentorTraction: 8,
      teamFeedbackStrongPoints: "Bom", teamFeedbackImprovements: "Melhorar",
      agreedNextSteps: "Continuar", mentorQualitativeAssessment: "Bom",
    });
    assert.equal((await request("DELETE", `/teams/${protectedId}`, confirmation(protectedTeam.body as Team), "admin")).status, 409);
    assert.equal((await db.select().from(mentoringSessionsTable).where(eq(mentoringSessionsTable.teamId, protectedId))).length, 1);

    const beforeRestart = await teams();
    await stop();
    await start(); // rerun the real seed routine against the same persistent database
    assert.deepEqual(await teams(), beforeRestart, "boot must preserve creates, edits, deletions and sessions");
    assert.equal((await db.select().from(teamsTable).where(eq(teamsTable.id, newTeam.id))).length, 0);
    assert.equal((await db.select().from(studentsTable).where(and(
      eq(studentsTable.id, originalStudent.id), eq(studentsTable.teamId, originalTeam.id),
    ))).length, 0);
    assert.equal((await db.select().from(mentorsTable)).length, original.length, "seed must not duplicate mentors");
    assert.equal((await db.select().from(mentoringSessionsTable).where(eq(mentoringSessionsTable.teamId, protectedId))).length, 1);

    // Delete an original official team too: a later boot must not recreate it.
    const deletable = (await teams()).find((team) => team.id !== protectedId && team.id !== originalTeam.id)!;
    assert.equal((await request("DELETE", `/teams/${deletable.id}`, confirmation(deletable), "admin")).status, 204);
    await stop();
    await start();
    assert.ok(!(await teams()).some((team) => team.id === deletable.id));

    // Even an incomplete/mismatched official roster must never be "repaired"
    // by deleting unknown records or recreating previously removed rows.
    const retained = (await teams()).find((team) => team.students.length > 0)!;
    await db.update(studentsTable).set({ name: "Nome corrigido pela equipe" })
      .where(eq(studentsTable.id, retained.students[0].id));
    const beforeUnknownSeed = {
      mentors: await db.select().from(mentorsTable),
      teams: await db.select().from(teamsTable),
      students: await db.select().from(studentsTable),
      sessions: await db.select().from(mentoringSessionsTable),
    };
    await seedDatabase();
    assert.deepEqual(await db.select().from(mentorsTable), beforeUnknownSeed.mentors);
    assert.deepEqual(await db.select().from(teamsTable), beforeUnknownSeed.teams);
    assert.deepEqual(await db.select().from(studentsTable), beforeUnknownSeed.students);
    assert.deepEqual(await db.select().from(mentoringSessionsTable), beforeUnknownSeed.sessions);
    assert.ok(!(await teams()).some((team) => team.id === deletable.id));
  } finally {
    await stop();
  }
});