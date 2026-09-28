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
import healthRoutes from "../src/routes/health";
import { rosterWriteLock } from "../src/lib/roster-lock";
import { officialTeams } from "../src/official-data";
import {
  legacyDemoMentors, legacyDemoTeams, legacySessionPayloads, seedDatabase,
} from "../src/seed";
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

async function start({ seed = true }: { seed?: boolean } = {}) {
  // Matches the startup order in src/index.ts, with a local identity shim in
  // place of Clerk's token verification. No production HTTP server is used.
  if (seed) await seedDatabase();
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
  app.use("/api", healthRoutes, listRoutes, teamRoutes, studentRoutes);
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

async function clearRosterTables() {
  await db.delete(mentoringSessionsTable);
  await db.delete(studentsTable);
  await db.delete(teamsTable);
  await db.delete(mentorsTable);
}

test("health reports a disconnected database when its query fails", async () => {
  const { rows: [{ name: databaseName }] } = await pool.query<{ name: string }>(
    "SELECT current_database() AS name",
  );
  assert.match(databaseName, /^roster_test_/, "the outage test must use the disposable test database");
  await start({ seed: false });
  let queryMock: ReturnType<typeof mock.method> | undefined;
  try {
    assert.deepEqual(await request("GET", "/health"), {
      status: 200,
      body: { status: "ok", database: "connected" },
    });

    queryMock = mock.method(pool, "query", async () => {
      throw new Error("simulated database outage");
    });
    assert.deepEqual(await request("GET", "/health"), {
      status: 503,
      body: { status: "error", database: "disconnected" },
    });
    assert.equal(queryMock.mock.callCount(), 1);
    assert.equal(queryMock.mock.calls[0].arguments[0], "SELECT 1");
  } finally {
    queryMock?.mock.restore();
    await stop();
  }
});

async function insertLegacyDemo({ withRealStudent = false } = {}) {
  const mentors = await db.insert(mentorsTable).values([...legacyDemoMentors]).returning();
  const mentorIdByName = new Map(mentors.map(({ id, name }) => [name, id]));
  const teams = await db.insert(teamsTable).values(
    legacyDemoTeams.map((team, index) => ({
      name: team.name,
      pitchSummary: team.pitchSummary,
      currentStage: team.currentStage,
      mainMentorId: mentorIdByName.get(legacyDemoMentors[index].name)!,
    })),
  ).returning();
  const teamIdByName = new Map(teams.map(({ id, name }) => [name, id]));
  const sessions = await db.insert(mentoringSessionsTable).values(
    legacySessionPayloads(mentorIdByName, teamIdByName).map((session, index) => ({
      ...session,
      sessionDate: `2025-01-${String(index + 1).padStart(2, "0")}`,
    })),
  ).returning();
  const students = withRealStudent
    ? await db.insert(studentsTable).values({
      teamId: teamIdByName.get(legacyDemoTeams[0].name)!,
      name: "Estudante cadastrado pela equipe",
      sortOrder: 0,
    }).returning()
    : [];
  return { mentors, teams, students, sessions };
}

async function rosterSnapshot() {
  const byId = <T extends { id: number }>(rows: T[]) => rows.sort((a, b) => a.id - b.id);
  return {
    mentors: byId(await db.select().from(mentorsTable)),
    teams: byId(await db.select().from(teamsTable)),
    students: byId(await db.select().from(studentsTable)),
    sessions: byId(await db.select().from(mentoringSessionsTable)),
  };
}

async function assertLegacyDataPreservedAfterChange(
  change: (legacy: Awaited<ReturnType<typeof insertLegacyDemo>>) => Promise<unknown>,
) {
  await clearRosterTables();
  try {
    const legacy = await insertLegacyDemo();
    assert.equal(legacy.mentors.length, legacyDemoMentors.length);
    assert.equal(legacy.teams.length, legacyDemoTeams.length);
    assert.equal(legacy.students.length, 0);
    assert.equal(legacy.sessions.length, legacyDemoTeams.length * 3);

    await change(legacy);
    const beforeSeed = await rosterSnapshot();
    await seedDatabase();

    assert.deepEqual(
      await rosterSnapshot(),
      beforeSeed,
      "a changed legacy field must preserve mentors, teams, students and sessions",
    );
  } finally {
    await clearRosterTables();
  }
}

test("only the complete legacy demo migrates; any changed legacy data is preserved", async () => {
  await clearRosterTables();
  try {
    const legacy = await insertLegacyDemo();
    assert.equal(legacy.mentors.length, legacyDemoMentors.length);
    assert.equal(legacy.teams.length, legacyDemoTeams.length);
    assert.equal(legacy.students.length, 0);
    assert.equal(legacy.sessions.length, legacyDemoTeams.length * 3);

    await seedDatabase();

    const official = await rosterSnapshot();
    assert.equal(official.mentors.length, officialTeams.length);
    assert.equal(official.teams.length, officialTeams.length);
    assert.equal(official.students.length, officialTeams.reduce((count, team) => count + team.students.length, 0));
    assert.deepEqual(official.sessions, [], "legacy sessions are removed only when the complete fixture matches");
    const mentorNameById = new Map(official.mentors.map(({ id, name }) => [id, name]));
    const teamNameById = new Map(official.teams.map(({ id, name }) => [id, name]));
    assert.deepEqual(
      official.teams.map(({ id, mainMentorId }) => ({
        team: teamNameById.get(id),
        mentor: mentorNameById.get(mainMentorId),
      })).sort((a, b) => a.team!.localeCompare(b.team!)),
      officialTeams.map(({ name, mentor }) => ({ team: name, mentor }))
        .sort((a, b) => a.team.localeCompare(b.team)),
      "the replacement must use the official mentor/team relationships",
    );

    await clearRosterTables();
    await insertLegacyDemo({ withRealStudent: true });
    const changedMentor = await db.select().from(mentorsTable)
      .where(eq(mentorsTable.name, legacyDemoMentors[0].name));
    assert.equal(changedMentor.length, 1);
    await db.update(mentorsTable)
      .set({ expertiseArea: "Área atualizada pela equipe" })
      .where(eq(mentorsTable.id, changedMentor[0].id));

    const beforeUnrecognizedSeed = await rosterSnapshot();
    assert.equal(beforeUnrecognizedSeed.students.length, 1);
    await seedDatabase();
    assert.deepEqual(
      await rosterSnapshot(),
      beforeUnrecognizedSeed,
      "one changed legacy field and a real student must prevent deletion of every roster record",
    );
  } finally {
    await clearRosterTables();
  }
});

test("a changed legacy team or session field preserves every roster table", async (t) => {
  await t.test("team pitch summary differs from the legacy fixture", async () => {
    await assertLegacyDataPreservedAfterChange(async ({ teams }) => {
      await db.update(teamsTable)
        .set({ pitchSummary: "Resumo atualizado pela equipe" })
        .where(eq(teamsTable.id, teams[0].id));
    });
  });

  await t.test("session evaluation differs from the legacy fixture", async () => {
    await assertLegacyDataPreservedAfterChange(async ({ sessions }) => {
      await db.update(mentoringSessionsTable)
        .set({ teamNps: 0 })
        .where(eq(mentoringSessionsTable.id, sessions[0].id));
    });
  });
});

test("a changed legacy mentor or team signature field preserves every roster table", async (t) => {
  await t.test("mentor email differs from the legacy fixture", async () => {
    await assertLegacyDataPreservedAfterChange(async ({ mentors }) => {
      await db.update(mentorsTable)
        .set({ email: "ana.atualizada@example.org" })
        .where(eq(mentorsTable.id, mentors[0].id));
    });
  });

  await t.test("mentor type differs from the legacy fixture", async () => {
    await assertLegacyDataPreservedAfterChange(async ({ mentors }) => {
      await db.update(mentorsTable)
        .set({ mentorType: "externo" })
        .where(eq(mentorsTable.id, mentors[0].id));
    });
  });

  await t.test("team stage differs from the legacy fixture", async () => {
    await assertLegacyDataPreservedAfterChange(async ({ teams }) => {
      await db.update(teamsTable)
        .set({ currentStage: "Validação atualizada pela equipe" })
        .where(eq(teamsTable.id, teams[0].id));
    });
  });

  await t.test("team mentor assignment differs from the legacy fixture", async () => {
    await assertLegacyDataPreservedAfterChange(async ({ mentors, teams }) => {
      await db.update(teamsTable)
        .set({ mainMentorId: mentors[1].id })
        .where(eq(teamsTable.id, teams[0].id));
    });
  });
});

test("a failed official roster insert rolls back the complete legacy replacement", async () => {
  await clearRosterTables();
  let triggerCreated = false;
  let functionCreated = false;
  try {
    const { rows: [{ name: databaseName }] } = await pool.query<{ name: string }>(
      "SELECT current_database() AS name",
    );
    assert.match(databaseName, /^roster_test_/, "this failure test must use run.mjs's disposable database");

    const legacy = await insertLegacyDemo();
    const beforeSeed = await rosterSnapshot();
    assert.equal(beforeSeed.mentors.length, legacyDemoMentors.length);
    assert.equal(beforeSeed.teams.length, legacyDemoTeams.length);
    assert.equal(beforeSeed.students.length, 0);
    assert.equal(beforeSeed.sessions.length, legacyDemoTeams.length * 3);

    await pool.query(`
      CREATE FUNCTION roster_test_fail_official_student_insert()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.sort_order = 1 THEN
          RAISE EXCEPTION 'simulated official roster insert failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    functionCreated = true;
    await pool.query(`
      CREATE TRIGGER roster_test_fail_official_student_insert
      BEFORE INSERT ON students
      FOR EACH ROW
      EXECUTE FUNCTION roster_test_fail_official_student_insert()
    `);
    triggerCreated = true;

    await assert.rejects(seedDatabase(), (error: unknown) => {
      let cause = error;
      while (cause instanceof Error) {
        if (cause.message.includes("simulated official roster insert failure")) return true;
        cause = cause.cause;
      }
      return false;
    });

    const afterFailure = await rosterSnapshot();
    assert.deepEqual(afterFailure, beforeSeed, "all legacy mentors, teams and sessions must survive");
    assert.deepEqual(afterFailure.mentors, legacy.mentors);
    assert.deepEqual(afterFailure.teams, legacy.teams);
    assert.deepEqual(afterFailure.sessions, legacy.sessions);
    assert.deepEqual(afterFailure.students, [], "no students from a partial official roster may remain");
    assert.equal(afterFailure.mentors.some(({ name }) =>
      officialTeams.some(({ mentor }) => mentor === name)
    ), false, "official mentors inserted before the failure must be rolled back");
    assert.equal(afterFailure.teams.some(({ name }) =>
      officialTeams.some(({ name: officialName }) => officialName === name)
    ), false, "official teams inserted before the failure must be rolled back");
  } finally {
    if (triggerCreated) {
      await pool.query("DROP TRIGGER roster_test_fail_official_student_insert ON students");
    }
    if (functionCreated) {
      await pool.query("DROP FUNCTION roster_test_fail_official_student_insert()");
    }
    await clearRosterTables();
  }
});

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

test("concurrent startup seeds serialize across separate database connections", async () => {
  const { rows: [{ name: databaseName }] } = await pool.query<{ name: string }>(
    "SELECT current_database() AS name",
  );
  assert.match(databaseName, /^roster_test_/, "concurrent seed test must use run.mjs's disposable database");
  await clearRosterTables();

  let releaseBlocker!: () => void;
  let signalLockAcquired!: () => void;
  const blockerRelease = new Promise<void>((resolve) => { releaseBlocker = resolve; });
  const lockAcquired = new Promise<void>((resolve) => { signalLockAcquired = resolve; });
  const blocker = db.transaction(async (tx) => {
    await tx.execute(rosterWriteLock);
    signalLockAcquired();
    await blockerRelease;
  });
  const seedRuns: Promise<void>[] = [];

  try {
    await lockAcquired;
    let settledSeeds = 0;
    seedRuns.push(seedDatabase().finally(() => { settledSeeds += 1; }));
    seedRuns.push(seedDatabase().finally(() => { settledSeeds += 1; }));

    const deadline = Date.now() + 5_000;
    let waitingBackendPids: number[] = [];
    while (Date.now() < deadline) {
      const { rows } = await pool.query<{ pid: number }>(`
        SELECT pid::int AS pid
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND NOT granted
          AND classid = 0
          AND objid = 732941
          AND objsubid = 1
        ORDER BY pid
      `);
      waitingBackendPids = rows.map(({ pid }) => pid);
      if (waitingBackendPids.length === 2) break;
      assert.equal(settledSeeds, 0, "both startup seeds must wait for the shared roster lock");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(waitingBackendPids.length, 2, "both seed transactions must wait for the shared roster lock");
    assert.equal(
      new Set(waitingBackendPids).size,
      2,
      "the concurrent seed transactions must use separate PostgreSQL connections",
    );

    releaseBlocker();
    await Promise.all(seedRuns);

    const official = await rosterSnapshot();
    const mentorNameById = new Map(official.mentors.map(({ id, name }) => [id, name]));
    const expectedMentors = officialTeams.map(({ mentor }) => mentor).sort();
    assert.deepEqual(official.mentors.map(({ name }) => name).sort(), expectedMentors);
    assert.equal(official.teams.length, officialTeams.length, "there must be exactly one official team per entry");
    assert.equal(
      official.students.length,
      officialTeams.reduce((count, team) => count + team.students.length, 0),
      "there must be exactly the official students, without duplicates",
    );
    assert.deepEqual(
      official.teams.map((team) => ({
        name: team.name,
        mentor: mentorNameById.get(team.mainMentorId),
        students: official.students
          .filter(({ teamId }) => teamId === team.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(({ name, sortOrder }) => ({ name, sortOrder })),
      })).sort((a, b) => a.name.localeCompare(b.name)),
      officialTeams.map(({ name, mentor, students }) => ({
        name,
        mentor,
        students: students.map((studentName, sortOrder) => ({ name: studentName, sortOrder })),
      })).sort((a, b) => a.name.localeCompare(b.name)),
      "concurrent seeds must leave the exact official mentor/team/student relationships and ordering",
    );
    assert.deepEqual(official.sessions, [], "concurrent seeds must not create mentoring sessions");
  } finally {
    releaseBlocker();
    await blocker;
    await Promise.allSettled(seedRuns);
    await clearRosterTables();
  }
});

test("concurrent startup replaces the legacy demo once across separate database connections", async () => {
  const { rows: [{ name: databaseName }] } = await pool.query<{ name: string }>(
    "SELECT current_database() AS name",
  );
  assert.match(databaseName, /^roster_test_/, "concurrent legacy migration must use run.mjs's disposable database");
  await clearRosterTables();

  let releaseBlocker!: () => void;
  let signalLockAcquired!: () => void;
  const blockerRelease = new Promise<void>((resolve) => { releaseBlocker = resolve; });
  const lockAcquired = new Promise<void>((resolve) => { signalLockAcquired = resolve; });
  const blocker = db.transaction(async (tx) => {
    await tx.execute(rosterWriteLock);
    signalLockAcquired();
    await blockerRelease;
  });
  const seedRuns: Promise<void>[] = [];

  try {
    const legacy = await insertLegacyDemo();
    assert.equal(legacy.mentors.length, legacyDemoMentors.length);
    assert.equal(legacy.teams.length, legacyDemoTeams.length);
    assert.equal(legacy.students.length, 0);
    assert.equal(legacy.sessions.length, legacyDemoTeams.length * 3);
    await lockAcquired;

    let settledSeeds = 0;
    seedRuns.push(seedDatabase().finally(() => { settledSeeds += 1; }));
    seedRuns.push(seedDatabase().finally(() => { settledSeeds += 1; }));

    const deadline = Date.now() + 5_000;
    let waitingBackendPids: number[] = [];
    while (Date.now() < deadline) {
      const { rows } = await pool.query<{ pid: number }>(`
        SELECT pid::int AS pid
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND NOT granted
          AND classid = 0
          AND objid = 732941
          AND objsubid = 1
        ORDER BY pid
      `);
      waitingBackendPids = rows.map(({ pid }) => pid);
      if (waitingBackendPids.length === 2) break;
      assert.equal(settledSeeds, 0, "both legacy migrations must wait for the shared roster lock");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(waitingBackendPids.length, 2, "both legacy seed transactions must wait for the shared roster lock");
    assert.equal(
      new Set(waitingBackendPids).size,
      2,
      "the concurrent legacy seed transactions must use separate PostgreSQL connections",
    );

    releaseBlocker();
    await Promise.all(seedRuns);

    const official = await rosterSnapshot();
    const mentorNameById = new Map(official.mentors.map(({ id, name }) => [id, name]));
    assert.deepEqual(
      official.mentors.map(({ name }) => name).sort(),
      officialTeams.map(({ mentor }) => mentor).sort(),
      "the legacy mentors must be replaced by exactly the official mentor set",
    );
    assert.equal(official.teams.length, officialTeams.length, "there must be exactly one official team per entry");
    assert.equal(
      official.students.length,
      officialTeams.reduce((count, team) => count + team.students.length, 0),
      "there must be exactly the official students, without duplicates",
    );
    assert.deepEqual(
      official.teams.map((team) => ({
        name: team.name,
        mentor: mentorNameById.get(team.mainMentorId),
        students: official.students
          .filter(({ teamId }) => teamId === team.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(({ name, sortOrder }) => ({ name, sortOrder })),
      })).sort((a, b) => a.name.localeCompare(b.name)),
      officialTeams.map(({ name, mentor, students }) => ({
        name,
        mentor,
        students: students.map((studentName, sortOrder) => ({ name: studentName, sortOrder })),
      })).sort((a, b) => a.name.localeCompare(b.name)),
      "the concurrent legacy migration must leave exact official relationships and ordering",
    );
    assert.deepEqual(official.sessions, [], "the legacy sessions must be removed without concurrent errors");
  } finally {
    releaseBlocker();
    await blocker;
    await Promise.allSettled(seedRuns);
    await clearRosterTables();
  }
});

test("a student edit concurrent with startup seed is serialized and preserved", async () => {
  await clearRosterTables();
  await seedDatabase();
  await start({ seed: false });

  let releaseBlocker!: () => void;
  let signalLockAcquired!: () => void;
  const blockerRelease = new Promise<void>((resolve) => { releaseBlocker = resolve; });
  const lockAcquired = new Promise<void>((resolve) => { signalLockAcquired = resolve; });
  const blocker = db.transaction(async (tx) => {
    await tx.execute(rosterWriteLock);
    signalLockAcquired();
    await blockerRelease;
  });

  let seedRun: Promise<void> | undefined;
  let editRun: Promise<{ status: number; body: unknown }> | undefined;
  try {
    await lockAcquired;
    const before = await rosterSnapshot();
    const team = (await teams())[0];
    assert.ok(team, "the initial official seed must include a team");
    const student = team.students[0];
    assert.ok(student, "the chosen team must include a student");
    const updatedName = `${student.name} (editada durante a inicialização)`;

    let seedSettled = false;
    let editSettled = false;
    seedRun = seedDatabase().finally(() => { seedSettled = true; });
    editRun = request(
      "PATCH",
      `/teams/${team.id}/students/${student.id}`,
      { expectedName: student.name, name: updatedName },
      "admin",
    ).finally(() => { editSettled = true; });

    const deadline = Date.now() + 5_000;
    let waitingOperations = 0;
    while (Date.now() < deadline) {
      const { rows: [{ count }] } = await pool.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND NOT granted
          AND classid = 0
          AND objid = 732941
          AND objsubid = 1
      `);
      waitingOperations = count;
      if (waitingOperations === 2) break;
      assert.equal(seedSettled, false, "startup seed must wait for the shared roster lock");
      assert.equal(editSettled, false, "administrative edit must wait for the shared roster lock");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(waitingOperations, 2, "both concurrent operations must wait on the roster lock");

    releaseBlocker();
    const [_, response] = await Promise.all([seedRun, editRun]);
    assert.equal(response.status, 200);
    assert.equal((response.body as { name: string }).name, updatedName);

    const expected = {
      ...before,
      students: before.students.map((row) =>
        row.id === student.id ? { ...row, name: updatedName } : row
      ),
    };
    assert.deepEqual(await rosterSnapshot(), expected, "the only roster change must be the administrator's edit");
    assert.equal(expected.mentors.length, officialTeams.length, "seed must not duplicate mentors");
    assert.equal(expected.teams.length, officialTeams.length, "seed must not duplicate teams");
    assert.equal(
      expected.students.length,
      officialTeams.reduce((total, entry) => total + entry.students.length, 0),
      "seed must not duplicate or remove students",
    );
    assert.deepEqual(expected.sessions, [], "startup seed must not create mentoring sessions");
  } finally {
    releaseBlocker();
    await blocker;
    const pendingOperations: Promise<unknown>[] = [];
    if (seedRun) pendingOperations.push(seedRun);
    if (editRun) pendingOperations.push(editRun);
    await Promise.allSettled(pendingOperations);
    await stop();
    await clearRosterTables();
  }
});

test("a team edit concurrent with startup seed is serialized and preserved", async () => {
  await clearRosterTables();
  await seedDatabase();
  await start({ seed: false });

  let releaseBlocker!: () => void;
  let signalLockAcquired!: () => void;
  const blockerRelease = new Promise<void>((resolve) => { releaseBlocker = resolve; });
  const lockAcquired = new Promise<void>((resolve) => { signalLockAcquired = resolve; });
  const blocker = db.transaction(async (tx) => {
    await tx.execute(rosterWriteLock);
    signalLockAcquired();
    await blockerRelease;
  });

  let seedRun: Promise<void> | undefined;
  let editRun: Promise<{ status: number; body: unknown }> | undefined;
  try {
    await lockAcquired;
    const before = await rosterSnapshot();
    const team = (await teams())[0];
    assert.ok(team, "the initial official seed must include a team");
    const updatedName = `${team.name} (editada durante a inicialização)`;

    let seedSettled = false;
    let editSettled = false;
    seedRun = seedDatabase().finally(() => { seedSettled = true; });
    editRun = request(
      "PATCH",
      `/teams/${team.id}`,
      { ...confirmation(team), name: updatedName },
      "admin",
    ).finally(() => { editSettled = true; });

    const deadline = Date.now() + 5_000;
    let waitingOperations = 0;
    while (Date.now() < deadline) {
      const { rows: [{ count }] } = await pool.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND NOT granted
          AND classid = 0
          AND objid = 732941
          AND objsubid = 1
      `);
      waitingOperations = count;
      if (waitingOperations === 2) break;
      assert.equal(seedSettled, false, "startup seed must wait for the shared roster lock");
      assert.equal(editSettled, false, "administrative edit must wait for the shared roster lock");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(waitingOperations, 2, "both concurrent operations must wait on the roster lock");

    releaseBlocker();
    const [_, response] = await Promise.all([seedRun, editRun]);
    assert.equal(response.status, 200);
    assert.equal((response.body as { name: string }).name, updatedName);

    const expected = {
      ...before,
      teams: before.teams.map((row) =>
        row.id === team.id ? { ...row, name: updatedName } : row
      ),
    };
    assert.deepEqual(await rosterSnapshot(), expected, "the only roster change must be the administrator's edit");
    assert.equal(expected.mentors.length, officialTeams.length, "seed must not duplicate mentors");
    assert.equal(expected.teams.length, officialTeams.length, "seed must not duplicate or remove teams");
    assert.equal(
      expected.students.length,
      officialTeams.reduce((total, entry) => total + entry.students.length, 0),
      "seed must not duplicate or remove students",
    );
    assert.deepEqual(expected.sessions, [], "startup seed must not create mentoring sessions");
  } finally {
    releaseBlocker();
    await blocker;
    const pendingOperations: Promise<unknown>[] = [];
    if (seedRun) pendingOperations.push(seedRun);
    if (editRun) pendingOperations.push(editRun);
    await Promise.allSettled(pendingOperations);
    await stop();
    await clearRosterTables();
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