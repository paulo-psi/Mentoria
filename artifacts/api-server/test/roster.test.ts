import assert from "node:assert/strict"
;

import 
{
 readFile 
}
 from "node:fs/promises"
;

import 
{
 after, mock, test 
}
 from "node:test"
;

import type 
{
 Server 
}
 from "node:http"
;

import path from "node:path"
;

import express from "express"
;

import 
{
 clerkClient 
}
 from "@clerk/express"
;

import 
{
 asc, and, eq 
}
 from "drizzle-orm"
;

import 
{

  db, pool, mentorsTable, mentoringSessionsTable, rosterAuditTable, studentsTable, teamsTable,
}
 from "@workspace/db"
;

import teamRoutes from "../src/routes/team-maintenance"
;

import studentRoutes from "../src/routes/students"
;

import listRoutes from "../src/routes/teams"
;

import healthRoutes, 
{
 HEALTH_DB_TIMEOUT_MS 
}
 from "../src/routes/health"
;

import dashboardRoutes from "../src/routes/dashboard"
;

import accessRoutes from "../src/routes/access"
;

import rosterAuditRoutes from "../src/routes/roster-audit"
;

import 
{
 rosterWriteLock 
}
 from "../src/lib/roster-lock"
;

import 
{
 officialTeams 
}
 from "../src/official-data"
;

import 
{

  legacyDemoMentors, legacyDemoTeams, legacySessionPayloads, seedDatabase,
}
 from "../src/seed"
;

import 
{
 logger 
}
 from "../src/lib/logger"
;


const ADMIN = "admin@test.invalid"
;

const READER = "reader@test.invalid"
;

process.env.HUB_ADMIN_EMAILS = ADMIN
;

process.env.HUB_ALLOWED_EMAILS = READER
;

process.env.LOG_LEVEL = "silent"
;


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
  if (seed) await seedDatabase()
;

  const app = express()
;

  app.use(express.json())
;

  app.use((req, _res, next) => 
{

    const userId = req.header("x-test-user")
;

    const auth = Object.assign(() => (
{
 userId: userId ?? null, tokenType: "session_token" 
}
), 
{

      [Symbol.for("@clerk/express.auth")]: true,
    
}
)
;

    (req as typeof req & 
{
 auth: typeof auth 
}
).auth = auth
;

    req.log = logger
;

    next()
;

  
}
)
;

  app.use("/api", healthRoutes, listRoutes, teamRoutes, dashboardRoutes, studentRoutes, accessRoutes, rosterAuditRoutes)
;

  server = app.listen(0)
;

  await new Promise<void>((resolve) => server!.once("listening", resolve))
;

  const address = server.address()
;

  if (!address || typeof address === "string") throw new Error("No local test port")
;

  baseUrl = `http://127.0.0.1:${address.port}/api`
;

}


async function stop() 
{

  if (!server) return
;

  const current = server
;

  server = undefined
;

  await new Promise<void>((resolve, reject) => current.close((error) => error ? reject(error) : resolve()))
;

}


after(async () => 
{

  await stop()
;

  await pool.end()
;

}
)
;


type Team = 
{

  id: number
;

  name: string
;

  mainMentor: 
{
 id: number
;
 name: string 
}
;

  students: Array<{ id: number; name: string; sortOrder: number }>;

  sessionCount: number
;
  totalSessions: number
;
  transversalSessionCount: number
;
  lastSessionDate: string | null
;
  lastSessionScore: number | null
;
  latestAgreedNextSteps: string | null
;

}
;


async function request(
  method: string, path: string, body?: unknown, user?: "admin" | "reader" | "other",
  signal?: AbortSignal,
) 
{

  const response = await fetch(baseUrl + path, 
{

    method,
    signal,
    headers: 
{

      ...(user ? 
{
 "x-test-user": user 
}
 : 
{
}
),
      ...(body === undefined ? 
{
}
 : 
{
 "content-type": "application/json" 
}
),
    
}
,
    body: body === undefined ? undefined : JSON.stringify(body),
  
}
)
;

  const text = await response.text()
;

  assert.ok(!text || response.headers.get("content-type")?.includes("application/json"), `${method} ${path}: ${response.status} ${text.slice(0, 500)}`)
;

  return { status: response.status, body: text ? JSON.parse(text) : null };

}


async function teams(): Promise<Team[]> 
{

  const response = await request("GET", "/teams", undefined, "admin")
;

  assert.equal(response.status, 200)
;

  return response.body as Team[]
;

}


function confirmation(team: Team) 
{

  return {
    expectedName: team.name,
    expectedMainMentorId: team.mainMentor.id,
    expectedStudents: team.students.map(({ id, name, sortOrder }) => ({ id, name, sortOrder })),
  };

}


type OfficialEntry = 
{

  numero: number
;

  mentor: string
;

  equipe: string
;

  integrantes: string[]
;

}
;


async function officialRoster(): Promise<OfficialEntry[]> 
{

  // This checked-in attachment is the source document, not a projection of
  // officialTeams: changes to either the seed data or the API must be noticed.
  const document = JSON.parse(await readFile(path.resolve(
    process.cwd(),
    "../../attached_assets/Pasted--programa-PIBEP-edicao-16-edi-o-ano-2026-titulo-documen_1790526119463.txt",
  ), "utf8")) as 
{

    programa: string
;
 edicao: string
;
 ano: number
;
 equipes: OfficialEntry[]
;

  
}
;

  assert.equal(document.programa, "PIBEP")
;

  assert.equal(document.edicao, "16ª edição")
;

  assert.equal(document.ano, 2026)
;

  assert.equal(document.equipes.length, 8)
;

  assert.deepEqual(document.equipes.map((
{
 numero 
}
) => numero), [1, 2, 3, 4, 5, 6, 7, 8])
;

  assert.equal(document.equipes.reduce((total, team) => total + team.integrantes.length, 0), 29)
;

  assert.equal(new Set(document.equipes.map((
{
 mentor 
}
) => mentor)).size, 8)
;

  assert.equal(new Set(document.equipes.map((
{
 equipe 
}
) => equipe)).size, 8)
;


  const text = (await readFile(path.resolve(
    process.cwd(),
    "../../attached_assets/Pasted-Considere-os-dados-abaixo-como-a-rela-o-oficial-entre-m_1790526154609.txt",
  ), "utf8")).replace(/\r\n/g, "\n")
;

  const listed = [...text.matchAll(
    /(\d+)\. Mentor\(a\): ([^\n]+)\n   Equipe: ([^\n]+)\n   Integrantes:\n((?:   - [^\n]+\n?)+)/g,
  )].map(([, numero, mentor, equipe, members]) => (
{

    numero: Number(numero),
    mentor,
    equipe,
    integrantes: [...members.matchAll(/^   - (.+)$/gm)].map(([, name]) => name),
  
}
))
;

  assert.deepEqual(listed, document.equipes, "both official attachments must agree")
;

  return document.equipes
;

}


function rosterProjection(rows: Team[]) 
{

  return rows.map((team) => (
{

    equipe: team.name,
    mentor: team.mainMentor.name,
    integrantes: team.students.map((
{
 name 
}
) => name),
    ordens: team.students.map((
{
 sortOrder 
}
) => sortOrder),
    sessoes: team.sessionCount,
  
}
))
;

}


async function clearRosterTables() 
{

  await db.delete(rosterAuditTable)
;

  await db.delete(mentoringSessionsTable)
;

  await db.delete(studentsTable)
;

  await db.delete(teamsTable)
;

  await db.delete(mentorsTable)
;

}


test("health reports a disconnected database when its query fails", async () => 
{

  const 
{
 rows: [
{
 name: databaseName 
}
] 
}
 = await pool.query<
{
 name: string 
}
>(
    "SELECT current_database() AS name",
  )
;

  assert.match(databaseName, /^roster_test_/, "the outage test must use the disposable test database")
;

  await start(
{
 seed: false 
}
)
;

  let queryMock: ReturnType<typeof mock.method> | undefined
;

  try 
{

    assert.deepEqual(await request("GET", "/health"), 
{

      status: 200,
      body: 
{
 status: "ok", database: "connected" 
}
,
    
}
)
;


    queryMock = mock.method(pool, "query", async () => 
{

      throw new Error("simulated database outage")
;

    
}
)
;

    assert.deepEqual(await request("GET", "/health"), 
{

      status: 503,
      body: 
{
 status: "error", database: "disconnected" 
}
,
    
}
)
;

    assert.equal(queryMock.mock.callCount(), 1)
;

    assert.deepEqual(queryMock.mock.calls[0].arguments[0], 
{

      text: "SELECT 1",
      query_timeout: HEALTH_DB_TIMEOUT_MS,
    
}
)
;

  
}
 finally 
{

    queryMock?.mock.restore()
;

    await stop()
;

  
}

}
)
;


test("health returns a bounded failure when its database query stalls", async () => 
{

  const 
{
 rows: [
{
 name: databaseName 
}
] 
}
 = await pool.query<
{
 name: string 
}
>(
    "SELECT current_database() AS name",
  )
;

  assert.match(databaseName, /^roster_test_/, "the stalled-query test must use the disposable test database")
;

  await start(
{
 seed: false 
}
)
;

  let releaseQuery: (() => void) | undefined
;

  const stalledQuery = new Promise<void>((resolve) => 
{
 releaseQuery = resolve
;
 
}
)
;

  let queryMock: ReturnType<typeof mock.method> | undefined
;

  try 
{

    queryMock = mock.method(pool, "query", () => stalledQuery)
;

    const started = performance.now()
;

    assert.deepEqual(
      await request("GET", "/health", undefined, undefined, AbortSignal.timeout(HEALTH_DB_TIMEOUT_MS + 2_500)),
      
{
 status: 503, body: 
{
 status: "error", database: "disconnected" 
}
 
}
,
    )
;

    assert.ok(
      performance.now() - started < HEALTH_DB_TIMEOUT_MS + 2_000,
      "monitoring must receive a failure promptly rather than wait for the stalled query",
    )
;

    assert.equal(queryMock.mock.callCount(), 1)
;

    assert.deepEqual(queryMock.mock.calls[0].arguments[0], 
{

      text: "SELECT 1",
      query_timeout: HEALTH_DB_TIMEOUT_MS,
    
}
)
;

  
}
 finally 
{

    releaseQuery?.()
;

    queryMock?.mock.restore()
;

    await stop()
;

  
}

}
)
;


async function insertLegacyDemo(
{
 withRealStudent = false 
}
 = 
{
}
) 
{

  const mentors = await db.insert(mentorsTable).values([...legacyDemoMentors]).returning()
;

  const mentorIdByName = new Map(mentors.map((
{
 id, name 
}
) => [name, id]))
;

  const teams = await db.insert(teamsTable).values(
    legacyDemoTeams.map((team, index) => (
{

      name: team.name,
      pitchSummary: team.pitchSummary,
      currentStage: team.currentStage,
      mainMentorId: mentorIdByName.get(legacyDemoMentors[index].name)!,
    
}
)),
  ).returning()
;

  const teamIdByName = new Map(teams.map((
{
 id, name 
}
) => [name, id]))
;

  const sessions = await db.insert(mentoringSessionsTable).values(
    legacySessionPayloads(mentorIdByName, teamIdByName).map((session, index) => (
{

      ...session,
      sessionDate: `2025-01-${String(index + 1).padStart(2, "0")}`,
    
}
)),
  ).returning()
;

  const students = withRealStudent
    ? await db.insert(studentsTable).values(
{

      teamId: teamIdByName.get(legacyDemoTeams[0].name)!,
      name: "Estudante cadastrado pela equipe",
      sortOrder: 0,
    
}
).returning()
    : []
;

  return { mentors, teams, students, sessions };

}


async function rosterSnapshot() 
{

  const byId = <T extends 
{
 id: number 
}
>(rows: T[]) => rows.sort((a, b) => a.id - b.id)
;

  return {
    mentors: byId(await db.select().from(mentorsTable)),
    teams: byId(await db.select().from(teamsTable)),
    students: byId(await db.select().from(studentsTable)),
    sessions: byId(await db.select().from(mentoringSessionsTable)),
  };

}


async function insertOfficialPrincipalSession(
  official: Awaited<ReturnType<typeof rosterSnapshot>>,
  sessionDate: string,
  teamIndex = 0,
) 
{

  const teamEntry = officialTeams[teamIndex]
;

  assert.ok(teamEntry, `official team index ${teamIndex} must exist`)
;

  const team = official.teams.find((
{
 name 
}
) => name === teamEntry.name)
;

  const mentor = official.mentors.find((
{
 name 
}
) => name === teamEntry.mentor)
;

  assert.ok(team)
;

  assert.ok(mentor)
;

  assert.equal(team.mainMentorId, mentor.id)
;


  const [session] = await db.insert(mentoringSessionsTable).values(
{

    teamId: team.id,
    mentorId: mentor.id,
    sessionType: "principal",
    sessionDate,
    teamNps: 9,
    teamActionability: 8,
    mentorCommitment: 9,
    mentorTraction: 7,
    teamFeedbackStrongPoints: "Boa colaboração",
    teamFeedbackImprovements: "Aprimorar o planejamento",
    agreedNextSteps: "Revisar o próximo ciclo",
    mentorQualitativeAssessment: "Evolução consistente",
  
}
).returning()
;

  assert.ok(session)
;

  return session
;

}


async function assertLegacyDataPreservedAfterChange(
  change: (legacy: Awaited<ReturnType<typeof insertLegacyDemo>>) => Promise<unknown>,
) 
{

  await clearRosterTables()
;

  try 
{

    const legacy = await insertLegacyDemo()
;

    assert.equal(legacy.mentors.length, legacyDemoMentors.length)
;

    assert.equal(legacy.teams.length, legacyDemoTeams.length)
;

    assert.equal(legacy.students.length, 0)
;

    assert.equal(legacy.sessions.length, legacyDemoTeams.length * 3)
;


    await change(legacy)
;

    const beforeSeed = await rosterSnapshot()
;

    await seedDatabase()
;


    assert.deepEqual(
      await rosterSnapshot(),
      beforeSeed,
      "a changed legacy roster must preserve mentors, teams, students and sessions",
    )
;

  
}
 finally 
{

    await clearRosterTables()
;

  
}

}


async function assertOfficialDataPreservedAfterRename(
  rename: (official: Awaited<ReturnType<typeof rosterSnapshot>>) => Promise<unknown>,
) 
{

  await clearRosterTables()
;

  try 
{

    await seedDatabase()
;

    const official = await rosterSnapshot()
;

    assert.equal(official.mentors.length, officialTeams.length)
;

    assert.equal(official.teams.length, officialTeams.length)
;

    assert.equal(official.students.length, officialTeams.reduce((total, team) => total + team.students.length, 0))
;

    assert.deepEqual(official.sessions, [])
;


    await rename(official)
;

    const beforeSeed = await rosterSnapshot()
;

    await seedDatabase()
;

    assert.deepEqual(
      await rosterSnapshot(),
      beforeSeed,
      "renaming one official record must preserve mentors, teams, students and sessions",
    )
;

  
}
 finally 
{

    await clearRosterTables()
;

  
}

}


test("only the complete legacy demo migrates; any changed legacy data is preserved", async () => 
{

  await clearRosterTables()
;

  try 
{

    const legacy = await insertLegacyDemo()
;

    assert.equal(legacy.mentors.length, legacyDemoMentors.length)
;

    assert.equal(legacy.teams.length, legacyDemoTeams.length)
;

    assert.equal(legacy.students.length, 0)
;

    assert.equal(legacy.sessions.length, legacyDemoTeams.length * 3)
;


    await seedDatabase()
;


    const official = await rosterSnapshot()
;

    assert.equal(official.mentors.length, officialTeams.length)
;

    assert.equal(official.teams.length, officialTeams.length)
;

    assert.equal(official.students.length, officialTeams.reduce((count, team) => count + team.students.length, 0))
;

    assert.deepEqual(official.sessions, [], "legacy sessions are removed only when the complete fixture matches")
;

    const mentorNameById = new Map(official.mentors.map((
{
 id, name 
}
) => [id, name]))
;

    const teamNameById = new Map(official.teams.map((
{
 id, name 
}
) => [id, name]))
;

    assert.deepEqual(
      official.teams.map((
{
 id, mainMentorId 
}
) => (
{

        team: teamNameById.get(id),
        mentor: mentorNameById.get(mainMentorId),
      
}
)).sort((a, b) => a.team!.localeCompare(b.team!)),
      officialTeams.map((
{
 name, mentor 
}
) => (
{
 team: name, mentor 
}
))
        .sort((a, b) => a.team.localeCompare(b.team)),
      "the replacement must use the official mentor/team relationships",
    )
;


    await clearRosterTables()
;

    await insertLegacyDemo(
{
 withRealStudent: true 
}
)
;

    const beforeUnrecognizedSeed = await rosterSnapshot()
;

    assert.equal(beforeUnrecognizedSeed.students.length, 1)
;

    await seedDatabase()
;

    assert.deepEqual(
      await rosterSnapshot(),
      beforeUnrecognizedSeed,
      "a real student alone must prevent deletion of every roster record",
    )
;

  
}
 finally 
{

    await clearRosterTables()
;

  
}

}
)
;


test("a different legacy session date still allows the official roster to replace the demo", async () => 
{

  await clearRosterTables()
;

  try 
{

    const legacy = await insertLegacyDemo()
;

    assert.equal(legacy.mentors.length, legacyDemoMentors.length)
;

    assert.equal(legacy.teams.length, legacyDemoTeams.length)
;

    assert.equal(legacy.students.length, 0)
;

    assert.equal(legacy.sessions.length, legacyDemoTeams.length * 3)
;


    const changedDate = "2024-12-31"
;

    assert.notEqual(legacy.sessions[0].sessionDate, changedDate)
;

    const changed = await db.update(mentoringSessionsTable)
      .set(
{
 sessionDate: changedDate 
}
)
      .where(eq(mentoringSessionsTable.id, legacy.sessions[0].id))
      .returning()
;

    assert.equal(changed.length, 1)
;

    assert.equal(changed[0].sessionDate, changedDate)
;


    await seedDatabase()
;


    const official = await rosterSnapshot()
;

    assert.equal(official.mentors.length, officialTeams.length)
;

    assert.equal(official.teams.length, officialTeams.length)
;

    assert.equal(official.students.length, officialTeams.reduce((count, team) => count + team.students.length, 0))
;

    assert.deepEqual(official.sessions, [], "all legacy demo sessions must be removed")
;

    const mentorNameById = new Map(official.mentors.map((
{
 id, name 
}
) => [id, name]))
;

    assert.deepEqual(
      official.teams.map((team) => (
{

        name: team.name,
        mentor: mentorNameById.get(team.mainMentorId),
        students: official.students.filter((
{
 teamId 
}
) => teamId === team.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((
{
 name 
}
) => name),
      
}
)).sort((a, b) => a.name.localeCompare(b.name)),
      officialTeams.map((
{
 name, mentor, students 
}
) => (
{
 name, mentor, students 
}
))
        .sort((a, b) => a.name.localeCompare(b.name)),
      "the changed date must not block the complete official roster import",
    )
;

  
}
 finally 
{

    await clearRosterTables()
;

  
}

}
)
;


test("extra mentors or teams in a legacy roster survive startup seeding", async (t) => 
{

  await t.test("an additional mentor", async () => 
{

    await assertLegacyDataPreservedAfterChange(async (
{
 mentors 
}
) => 
{

      const added = await db.insert(mentorsTable).values(
{

        name: "Mentora adicional",
        email: "mentora.adicional@example.org",
        expertiseArea: "Planejamento",
        mentorType: "externo",
      
}
).returning()
;

      assert.equal(added.length, 1)
;

      assert.equal((await db.select().from(mentorsTable)).length, mentors.length + 1)
;

    
}
)
;

  
}
)
;


  await t.test("an additional team", async () => 
{

    await assertLegacyDataPreservedAfterChange(async (
{
 mentors, teams 
}
) => 
{

      const added = await db.insert(teamsTable).values(
{

        name: "Equipe adicional",
        pitchSummary: "Projeto cadastrado após a demonstração",
        currentStage: "Validação",
        mainMentorId: mentors[0].id,
      
}
).returning()
;

      assert.equal(added.length, 1)
;

      assert.equal((await db.select().from(teamsTable)).length, teams.length + 1)
;

    
}
)
;

  
}
)
;

}
)
;


test("a changed legacy team or session signature field preserves every roster table", async (t) => 
{

  await t.test("team pitch summary differs from the legacy fixture", async () => 
{

    await assertLegacyDataPreservedAfterChange(async (
{
 teams 
}
) => 
{

      await db.update(teamsTable)
        .set(
{
 pitchSummary: "Resumo atualizado pela equipe" 
}
)
        .where(eq(teamsTable.id, teams[0].id))
;

    
}
)
;

  
}
)
;


  await t.test("session team NPS differs from the legacy fixture", async () => 
{

    await assertLegacyDataPreservedAfterChange(async (
{
 sessions 
}
) => 
{

      await db.update(mentoringSessionsTable)
        .set(
{
 teamNps: 0 
}
)
        .where(eq(mentoringSessionsTable.id, sessions[0].id))
;

    
}
)
;

  
}
)
;


  type LegacyFixture = Awaited<ReturnType<typeof insertLegacyDemo>>
;

  const sessionChanges: Array<[
    string,
    (legacy: LegacyFixture) => Promise<unknown>,
  ]> = [
    [
      "session team actionability differs from the legacy fixture",
      async (
{
 sessions 
}
) => 
{

        await db.update(mentoringSessionsTable)
          .set(
{
 teamActionability: 0 
}
)
          .where(eq(mentoringSessionsTable.id, sessions[0].id))
;

      
}
,
    ],
    [
      "session mentor commitment differs from the legacy fixture",
      async (
{
 sessions 
}
) => 
{

        await db.update(mentoringSessionsTable)
          .set(
{
 mentorCommitment: 0 
}
)
          .where(eq(mentoringSessionsTable.id, sessions[0].id))
;

      
}
,
    ],
    [
      "session mentor traction differs from the legacy fixture",
      async (
{
 sessions 
}
) => 
{

        await db.update(mentoringSessionsTable)
          .set(
{
 mentorTraction: 0 
}
)
          .where(eq(mentoringSessionsTable.id, sessions[0].id))
;

      
}
,
    ],
    [
      "session team assignment differs from the legacy fixture",
      async (
{
 sessions, teams 
}
) => 
{

        await db.update(mentoringSessionsTable)
          .set(
{
 teamId: teams[1].id 
}
)
          .where(eq(mentoringSessionsTable.id, sessions[0].id))
;

      
}
,
    ],
    [
      "session mentor assignment differs from the legacy fixture",
      async (
{
 sessions, mentors 
}
) => 
{

        await db.update(mentoringSessionsTable)
          .set(
{
 mentorId: mentors[1].id 
}
)
          .where(eq(mentoringSessionsTable.id, sessions[0].id))
;

      
}
,
    ],
    [
      "session type differs from the legacy fixture",
      async (
{
 sessions 
}
) => 
{

        await db.update(mentoringSessionsTable)
          .set(
{
 sessionType: "transversal" 
}
)
          .where(eq(mentoringSessionsTable.id, sessions[0].id))
;

      
}
,
    ],
    [
      "team strong-points feedback differs from the legacy fixture",
      async (
{
 sessions 
}
) => 
{

        await db.update(mentoringSessionsTable)
          .set(
{
 teamFeedbackStrongPoints: "Pontos fortes atualizados" 
}
)
          .where(eq(mentoringSessionsTable.id, sessions[0].id))
;

      
}
,
    ],
    [
      "team improvements feedback differs from the legacy fixture",
      async (
{
 sessions 
}
) => 
{

        await db.update(mentoringSessionsTable)
          .set(
{
 teamFeedbackImprovements: "Melhorias atualizadas" 
}
)
          .where(eq(mentoringSessionsTable.id, sessions[0].id))
;

      
}
,
    ],
    [
      "agreed next steps differ from the legacy fixture",
      async (
{
 sessions 
}
) => 
{

        await db.update(mentoringSessionsTable)
          .set(
{
 agreedNextSteps: "Próximos passos atualizados" 
}
)
          .where(eq(mentoringSessionsTable.id, sessions[0].id))
;

      
}
,
    ],
    [
      "mentor qualitative assessment differs from the legacy fixture",
      async (
{
 sessions 
}
) => 
{

        await db.update(mentoringSessionsTable)
          .set(
{
 mentorQualitativeAssessment: "Avaliação qualitativa atualizada" 
}
)
          .where(eq(mentoringSessionsTable.id, sessions[0].id))
;

      
}
,
    ],
  ]
;


  for (const [name, change] of sessionChanges) 
{

    await t.test(name, async () => assertLegacyDataPreservedAfterChange(change))
;

  
}

}
)
;


test("adding or removing a legacy session preserves every roster table on startup", async (t) => 
{

  await t.test("one new session", async () => 
{

    await assertLegacyDataPreservedAfterChange(async (
{
 sessions 
}
) => 
{

      const 
{
 id: _id, createdAt: _createdAt, ...session 
}
 = sessions[0]
;

      await db.insert(mentoringSessionsTable).values(
{

        ...session,
        sessionDate: "2025-02-01",
        agreedNextSteps: "Registrar os resultados da nova sessão.",
      
}
)
;

      assert.equal((await db.select().from(mentoringSessionsTable)).length, sessions.length + 1)
;

    
}
)
;

  
}
)
;


  await t.test("one removed session", async () => 
{

    await assertLegacyDataPreservedAfterChange(async (
{
 sessions 
}
) => 
{

      await db.delete(mentoringSessionsTable).where(eq(mentoringSessionsTable.id, sessions[0].id))
;

      assert.equal((await db.select().from(mentoringSessionsTable)).length, sessions.length - 1)
;

    
}
)
;

  
}
)
;

}
)
;


test("a changed legacy mentor or team signature field preserves every roster table", async (t) => 
{

  await t.test("mentor specialty differs from the legacy fixture", async () => 
{

    await assertLegacyDataPreservedAfterChange(async (
{
 mentors 
}
) => 
{

      const editedSpecialty = "Área atualizada pela equipe"
;

      assert.notEqual(mentors[0].expertiseArea, editedSpecialty)
;

      await db.update(mentorsTable)
        .set(
{
 expertiseArea: editedSpecialty 
}
)
        .where(eq(mentorsTable.id, mentors[0].id))
;

    
}
)
;

  
}
)
;


  await t.test("mentor email differs from the legacy fixture", async () => 
{

    await assertLegacyDataPreservedAfterChange(async (
{
 mentors 
}
) => 
{

      await db.update(mentorsTable)
        .set(
{
 email: "ana.atualizada@example.org" 
}
)
        .where(eq(mentorsTable.id, mentors[0].id))
;

    
}
)
;

  
}
)
;


  await t.test("mentor type differs from the legacy fixture", async () => 
{

    await assertLegacyDataPreservedAfterChange(async (
{
 mentors 
}
) => 
{

      await db.update(mentorsTable)
        .set(
{
 mentorType: "externo" 
}
)
        .where(eq(mentorsTable.id, mentors[0].id))
;

    
}
)
;

  
}
)
;


  await t.test("team stage differs from the legacy fixture", async () => 
{

    await assertLegacyDataPreservedAfterChange(async (
{
 teams 
}
) => 
{

      await db.update(teamsTable)
        .set(
{
 currentStage: "Validação atualizada pela equipe" 
}
)
        .where(eq(teamsTable.id, teams[0].id))
;

    
}
)
;

  
}
)
;


  await t.test("team mentor assignment differs from the legacy fixture", async () => 
{

    await assertLegacyDataPreservedAfterChange(async (
{
 mentors, teams 
}
) => 
{

      await db.update(teamsTable)
        .set(
{
 mainMentorId: mentors[1].id 
}
)
        .where(eq(teamsTable.id, teams[0].id))
;

    
}
)
;

  
}
)
;

}
)
;


test("renaming one legacy mentor or team preserves every roster table on startup", async (t) => 
{

  await t.test("mentor name changes alone", async () => 
{

    await assertLegacyDataPreservedAfterChange(async (
{
 mentors 
}
) => 
{

      await db.update(mentorsTable)
        .set(
{
 name: "Ana Beatriz Costa (renomeada)" 
}
)
        .where(eq(mentorsTable.id, mentors[0].id))
;

    
}
)
;

  
}
)
;


  await t.test("team name changes alone", async () => 
{

    await assertLegacyDataPreservedAfterChange(async (
{
 teams 
}
) => 
{

      await db.update(teamsTable)
        .set(
{
 name: "Verdeira (renomeada)" 
}
)
        .where(eq(teamsTable.id, teams[0].id))
;

    
}
)
;

  
}
)
;

}
)
;


test("renaming one official mentor or team preserves every roster table on startup", async (t) => 
{

  await t.test("mentor name changes alone", async () => 
{

    await assertOfficialDataPreservedAfterRename(async (
{
 mentors 
}
) => 
{

      const mentor = mentors.find((
{
 name 
}
) => name === officialTeams[0].mentor)
;

      assert.ok(mentor)
;

      const renamed = await db.update(mentorsTable)
        .set(
{
 name: `${mentor.name} (renomeada)` 
}
)
        .where(eq(mentorsTable.id, mentor.id))
        .returning()
;

      assert.equal(renamed.length, 1)
;

    
}
)
;

  
}
)
;


  await t.test("team name changes alone", async () => 
{

    await assertOfficialDataPreservedAfterRename(async (
{
 teams 
}
) => 
{

      const team = teams.find((
{
 name 
}
) => name === officialTeams[0].name)
;

      assert.ok(team)
;

      const renamed = await db.update(teamsTable)
        .set(
{
 name: `${team.name} (renomeada)` 
}
)
        .where(eq(teamsTable.id, team.id))
        .returning()
;

      assert.equal(renamed.length, 1)
;

    
}
)
;

  
}
)
;

}
)
;


test("a newly recorded official session survives startup seeding", async () => 
{

  await clearRosterTables()
;

  try 
{

    await seedDatabase()
;

    const official = await rosterSnapshot()
;

    assert.equal(official.mentors.length, officialTeams.length)
;

    assert.equal(official.teams.length, officialTeams.length)
;

    assert.equal(official.students.length, officialTeams.reduce((total, team) => total + team.students.length, 0))
;

    assert.deepEqual(official.sessions, [])
;


    const session = await insertOfficialPrincipalSession(official, "2026-03-01")
;


    const beforeSeed = await rosterSnapshot()
;

    assert.deepEqual(beforeSeed.sessions, [session], "the new official session must be present before startup")
;

    await seedDatabase()
;

    assert.deepEqual(
      await rosterSnapshot(),
      beforeSeed,
      "startup must preserve the official mentors, teams, students and newly recorded session",
    )
;

  
}
 finally 
{

    await clearRosterTables()
;

  
}

}
)
;


test("edited feedback on an official session survives startup seeding", async () => 
{

  const 
{
 rows: [
{
 name: databaseName 
}
] 
}
 = await pool.query<
{
 name: string 
}
>(
    "SELECT current_database() AS name",
  )
;

  assert.match(databaseName, /^roster_test_/, "the edited session must use the disposable test database")
;

  await clearRosterTables()
;

  try 
{

    await seedDatabase()
;

    const official = await rosterSnapshot()
;

    assert.equal(official.mentors.length, officialTeams.length)
;

    assert.equal(official.teams.length, officialTeams.length)
;

    assert.equal(official.students.length, officialTeams.reduce((total, team) => total + team.students.length, 0))
;

    assert.deepEqual(official.sessions, [])
;


    const session = await insertOfficialPrincipalSession(official, "2026-03-03")
;


    const editedFeedback = "Aprimorar o planejamento com base nos dados do piloto."
;

    const [editedSession] = await db.update(mentoringSessionsTable)
      .set(
{
 teamFeedbackImprovements: editedFeedback 
}
)
      .where(eq(mentoringSessionsTable.id, session.id))
      .returning()
;

    assert.deepEqual(
      editedSession,
      
{
 ...session, teamFeedbackImprovements: editedFeedback 
}
,
      "the update must change only the selected feedback field",
    )
;


    const beforeSeed = await rosterSnapshot()
;

    assert.deepEqual(beforeSeed.sessions, [editedSession], "the corrected session must be present before startup")
;

    await seedDatabase()
;

    assert.deepEqual(
      await rosterSnapshot(),
      beforeSeed,
      "startup must preserve mentors, teams, students and the corrected official session",
    )
;

  
}
 finally 
{

    await clearRosterTables()
;

  
}

}
)
;


test("a corrected official session rating survives startup seeding", async () => 
{

  const 
{
 rows: [
{
 name: databaseName 
}
] 
}
 = await pool.query<
{
 name: string 
}
>(
    "SELECT current_database() AS name",
  )
;

  assert.match(databaseName, /^roster_test_/, "the corrected rating must use the disposable test database")
;

  await clearRosterTables()
;

  try 
{

    await seedDatabase()
;

    const official = await rosterSnapshot()
;

    assert.equal(official.mentors.length, officialTeams.length)
;

    assert.equal(official.teams.length, officialTeams.length)
;

    assert.equal(official.students.length, officialTeams.reduce((total, team) => total + team.students.length, 0))
;

    assert.deepEqual(official.sessions, [])
;


    const session = await insertOfficialPrincipalSession(official, "2026-03-05")
;

    const correctedRating = 10
;

    assert.notEqual(session.teamNps, correctedRating)
;

    const [correctedSession] = await db.update(mentoringSessionsTable)
      .set(
{
 teamNps: correctedRating 
}
)
      .where(eq(mentoringSessionsTable.id, session.id))
      .returning()
;

    assert.deepEqual(
      correctedSession,
      
{
 ...session, teamNps: correctedRating 
}
,
      "the correction must change only the selected numeric rating",
    )
;


    const beforeSeed = await rosterSnapshot()
;

    assert.deepEqual(beforeSeed.sessions, [correctedSession], "the corrected session must be present before startup")
;

    await seedDatabase()
;

    assert.deepEqual(
      await rosterSnapshot(),
      beforeSeed,
      "startup must preserve mentors, teams, students and the corrected official session rating",
    )
;

  
}
 finally 
{

    await clearRosterTables()
;

  
}

}
)
;


test("a deleted official session stays deleted after startup seeding", async () => 
{

  const 
{
 rows: [
{
 name: databaseName 
}
] 
}
 = await pool.query<
{
 name: string 
}
>(
    "SELECT current_database() AS name",
  )
;

  assert.match(databaseName, /^roster_test_/, "the deleted session must use the disposable test database")
;

  await clearRosterTables()
;

  try 
{

    await seedDatabase()
;

    const official = await rosterSnapshot()
;

    assert.equal(official.mentors.length, officialTeams.length)
;

    assert.equal(official.teams.length, officialTeams.length)
;

    assert.equal(official.students.length, officialTeams.reduce((total, team) => total + team.students.length, 0))
;

    assert.deepEqual(official.sessions, [])
;


    const deletedSession = await insertOfficialPrincipalSession(official, "2026-03-07")
;

    const retainedSession = await insertOfficialPrincipalSession(official, "2026-03-14")
;

    assert.notEqual(deletedSession.id, retainedSession.id)
;


    const deleted = await db.delete(mentoringSessionsTable)
      .where(eq(mentoringSessionsTable.id, deletedSession.id))
      .returning()
;

    assert.deepEqual(deleted, [deletedSession], "exactly the selected session must be deleted")
;


    const beforeSeed = await rosterSnapshot()
;

    assert.deepEqual(beforeSeed.sessions, [retainedSession])
;

    await seedDatabase()
;

    const afterSeed = await rosterSnapshot()
;

    assert.deepEqual(
      afterSeed,
      beforeSeed,
      "startup must preserve the roster and remaining sessions without restoring the deletion",
    )
;

    assert.equal(
      afterSeed.sessions.some((
{
 id 
}
) => id === deletedSession.id),
      false,
      "the deleted session must remain absent",
    )
;

    await start({ seed: false })
;
    const listedTeam = (await teams()).find(({ id }) => id === retainedSession.teamId)
;
    assert.ok(listedTeam, "the affected official team must remain in the team list")
;
    assert.equal(listedTeam.sessionCount, 1, "the team list must report its one remaining session")
;

  
}
 finally 
{

    await stop()
;
    await clearRosterTables()
;

  
}

}
)
;


test("deleting every official session leaves the session list empty after startup seeding", async () => {
  const { rows: [{ name: databaseName }] } = await pool.query<{ name: string }>(
    "SELECT current_database() AS name",
  );
  assert.match(databaseName, /^roster_test_/, "deleting all sessions must use the disposable test database");

  await clearRosterTables();
  try {
    await seedDatabase();
    const official = await rosterSnapshot();

    assert.equal(official.mentors.length, officialTeams.length);
    assert.equal(official.teams.length, officialTeams.length);
    assert.equal(
      official.students.length,
      officialTeams.reduce((total, team) => total + team.students.length, 0),
    );
    assert.deepEqual(official.sessions, []);

    const firstSession = await insertOfficialPrincipalSession(official, "2026-03-21");
    const secondSession = await insertOfficialPrincipalSession(official, "2026-03-28");
    assert.notEqual(firstSession.id, secondSession.id);

    const deleted = await db.delete(mentoringSessionsTable)
      .where(eq(mentoringSessionsTable.teamId, firstSession.teamId))
      .returning();
    assert.deepEqual(
      deleted.map(({ id }) => id).sort((a, b) => a - b),
      [firstSession.id, secondSession.id].sort((a, b) => a - b),
      "both official sessions must be deleted",
    );

    const beforeSeed = await rosterSnapshot();
    assert.deepEqual(beforeSeed.sessions, []);

    await seedDatabase();
    const afterSeed = await rosterSnapshot();
    assert.deepEqual(
      afterSeed,
      beforeSeed,
      "startup must preserve mentors, teams and students without recreating deleted sessions",
    );
    assert.deepEqual(afterSeed.sessions, [], "startup must not recreate sessions after the last ones are deleted");

    await start({ seed: false });
    const apiTeam = (await teams()).find((team) => team.id === firstSession.teamId);
    assert.ok(apiTeam, "the API must continue to return the affected official team");
    assert.equal(apiTeam.sessionCount, 0, "the team list API must report zero sessions after all sessions are deleted");
  } finally {
    await stop();
    await clearRosterTables();
    assert.deepEqual(
      await rosterSnapshot(),
      { mentors: [], teams: [], students: [], sessions: [] },
      "test cleanup must remove every row it created",
    );
  }
});

test("team list reports separate session counts for official teams", async () => {
  const { rows: [{ name: databaseName }] } = await pool.query<{ name: string }>(
    "SELECT current_database() AS name",
  );
  assert.match(databaseName, /^roster_test_/, "session counts must use the disposable test database");

  await clearRosterTables();
  try {
    await seedDatabase();
    const official = await rosterSnapshot();
    assert.equal(official.teams.length, officialTeams.length, "the official roster must be imported");
    assert.deepEqual(official.sessions, [], "the official roster starts without sessions");

    const firstTeamLatestSession = await insertOfficialPrincipalSession(official, "2026-03-29");
    const firstTeamOlderSession = await insertOfficialPrincipalSession(official, "2026-03-22");
    const secondTeamSession = await insertOfficialPrincipalSession(official, "2026-04-05", 1);
    assert.equal(firstTeamLatestSession.teamId, firstTeamOlderSession.teamId);
    assert.notEqual(firstTeamLatestSession.teamId, secondTeamSession.teamId);
    await db.update(mentoringSessionsTable)
      .set({ sessionType: "transversal" })
      .where(eq(mentoringSessionsTable.id, firstTeamLatestSession.id));

    await start({ seed: false });
    const rows = await teams();
    const countsByTeamName = new Map(rows.map((team) => [team.name, team.sessionCount]));
    const firstTeam = rows.find((team) => team.name === officialTeams[0].name);
    const secondTeam = rows.find((team) => team.name === officialTeams[1].name);
    const teamWithoutSessions = rows.find((team) => team.name === officialTeams[2].name);

    assert.equal(countsByTeamName.get(officialTeams[0].name), 2);
    assert.equal(countsByTeamName.get(officialTeams[1].name), 1);
    assert.equal(countsByTeamName.get(officialTeams[2].name), 0);
    assert.ok(firstTeam);
    assert.equal(firstTeam.totalSessions, 2);
    assert.equal(firstTeam.lastSessionDate, "2026-03-29");
    assert.equal(typeof firstTeam.lastSessionDate, "string");
    assert.equal(firstTeam.lastSessionScore, firstTeamLatestSession.teamNps);
    assert.equal(firstTeam.latestAgreedNextSteps, firstTeamLatestSession.agreedNextSteps);
    assert.equal(firstTeam.transversalSessionCount, 1);
    assert.ok(secondTeam);
    assert.equal(secondTeam.totalSessions, 1);
    assert.equal(secondTeam.lastSessionDate, "2026-04-05");
    assert.equal(secondTeam.lastSessionScore, secondTeamSession.teamNps);
    assert.equal(secondTeam.latestAgreedNextSteps, secondTeamSession.agreedNextSteps);
    assert.ok(teamWithoutSessions);
    assert.equal(teamWithoutSessions.totalSessions, 0);
    assert.equal(teamWithoutSessions.transversalSessionCount, 0);
    assert.equal(teamWithoutSessions.lastSessionDate, null);
    assert.equal(teamWithoutSessions.lastSessionScore, null);
    assert.equal(teamWithoutSessions.latestAgreedNextSteps, null);
  } finally {
    await stop();
    await clearRosterTables();
    assert.deepEqual(
      await rosterSnapshot(),
      { mentors: [], teams: [], students: [], sessions: [] },
      "test cleanup must remove every row it created",
    );
  }
});


test("mentor list requires approved access and aggregates sessions per mentor", async () => {
  await clearRosterTables();
  try {
    await seedDatabase();
    const officialTeams = await db.select({ id: teamsTable.id }).from(teamsTable).orderBy(asc(teamsTable.id)).limit(2);
    assert.equal(officialTeams.length, 2, "the official roster must include at least two teams");

    const [mentor] = await db.insert(mentorsTable).values({
      name: "Mentor agregado",
      email: "agregado@example.org",
      expertiseArea: "Estratégia",
      mentorType: "externo",
    }).returning();
    assert.ok(mentor);

    const sessionValues = [
      { teamId: officialTeams[0].id, teamNps: 8, sessionDate: "2026-03-01" },
      { teamId: officialTeams[0].id, teamNps: 9, sessionDate: "2026-03-08" },
      { teamId: officialTeams[1].id, teamNps: 9, sessionDate: "2026-03-15" },
    ].map(({ teamId, teamNps, sessionDate }) => ({
      teamId,
      mentorId: mentor.id,
      sessionType: "principal",
      sessionDate,
      teamNps,
      teamActionability: 8,
      mentorCommitment: 8,
      mentorTraction: 8,
      teamFeedbackStrongPoints: "Boa colaboração.",
      teamFeedbackImprovements: "Ampliar a validação.",
      agreedNextSteps: "Planejar o próximo ciclo.",
      mentorQualitativeAssessment: "Acompanhamento consistente.",
    }));
    await db.insert(mentoringSessionsTable).values(sessionValues);

    await start({ seed: false });
    assert.equal((await request("GET", "/mentors")).status, 401);
    assert.equal((await request("GET", "/mentors", undefined, "other")).status, 403);

    const response = await request("GET", "/mentors", undefined, "reader");
    assert.equal(response.status, 200);
    const rows = response.body as Array<{
      id: number;
      name: string;
      email: string | null;
      expertiseArea: string | null;
      mentorType: string | null;
      totalSessions: number;
      avgNpsReceived: number | null;
      assignedTeamsCount: number;
    }>;
    const sortedNames = rows.map(({ name }) => name);
    assert.deepEqual(sortedNames, [...sortedNames].sort((a, b) => a.localeCompare(b)));

    const aggregate = rows.find(({ id }) => id === mentor.id);
    assert.ok(aggregate);
    assert.deepEqual(aggregate, {
      id: mentor.id,
      name: "Mentor agregado",
      email: "agregado@example.org",
      expertiseArea: "Estratégia",
      mentorType: "externo",
      totalSessions: 3,
      avgNpsReceived: 8.7,
      assignedTeamsCount: 2,
    });

    const noSessions = rows.find(({ name }) => name !== mentor.name);
    assert.ok(noSessions);
    assert.equal(noSessions.totalSessions, 0);
    assert.equal(noSessions.avgNpsReceived, null);
    assert.equal(noSessions.assignedTeamsCount, 0);
  } finally {
    await stop();
    await clearRosterTables();
  }
});

test("mentor creation is administrator-only and records searchable audit history", async () => {
  await clearRosterTables();
  try {
    await start({ seed: false });

    assert.equal((await request("POST", "/mentors", { name: "Mentor de teste" })).status, 401);
    assert.equal((await request("POST", "/mentors", { name: "Mentor de teste" }, "reader")).status, 403);
    assert.equal((await request("POST", "/mentors", { name: "Mentor de teste" }, "other")).status, 403);
    assert.equal((await request("POST", "/mentors", { name: "   " }, "admin")).status, 400);
    assert.equal((await request("POST", "/mentors", { name: "Mentor", mentorType: "invalid" }, "admin")).status, 400);

    const response = await request("POST", "/mentors", {
      name: "Mentora de Empreendedorismo",
      email: "mentora@example.org",
      expertiseArea: "Inovação",
      mentorType: "externo",
    }, "admin");
    assert.equal(response.status, 201);
    const mentor = response.body as {
      id: number;
      name: string;
      email: string | null;
      expertiseArea: string | null;
      mentorType: string | null;
      totalSessions: number;
      avgNpsReceived: number | null;
      assignedTeamsCount: number;
    };
    assert.equal(mentor.name, "Mentora de Empreendedorismo");
    assert.equal(mentor.email, "mentora@example.org");
    assert.equal(mentor.expertiseArea, "Inovação");
    assert.equal(mentor.mentorType, "externo");
    assert.equal(mentor.totalSessions, 0);
    assert.equal(mentor.avgNpsReceived, null);
    assert.equal(mentor.assignedTeamsCount, 0);

    const duplicateEmail = await request("POST", "/mentors", {
      name: "Outra mentora",
      email: "mentora@example.org",
    }, "admin");
    assert.equal(duplicateEmail.status, 409);

    const history = await request("GET", "/roster-audit", undefined, "admin");
    assert.equal(history.status, 200);
    const events = history.body as Array<{
      teamId: number | null;
      studentId: number | null;
      mentorId: number | null;
      action: string;
      actorEmail: string;
      summary: string;
    }>;
    assert.equal(events.length, 1);
    assert.equal(events[0].teamId, null);
    assert.equal(events[0].studentId, null);
    assert.equal(events[0].mentorId, mentor.id);
    assert.equal(events[0].action, "mentor.created");
    assert.equal(events[0].actorEmail, ADMIN);
    assert.equal(events[0].summary, "Mentor cadastrado: Mentora de Empreendedorismo.");

    const mentorHistory = await request("GET", `/roster-audit?mentorId=${mentor.id}`, undefined, "admin");
    assert.equal(mentorHistory.status, 200);
    assert.equal((mentorHistory.body as Array<{ mentorId: number }>)[0]?.mentorId, mentor.id);
    assert.deepEqual((await request("GET", "/roster-audit?teamId=1", undefined, "admin")).body, []);
    assert.equal((await request("GET", "/roster-audit?mentorId=invalid", undefined, "admin")).status, 400);
  } finally {
    await stop();
    await clearRosterTables();
  }
});

test("dashboard stats require approved access and return zeroes without sessions", async () => {
  await clearRosterTables();
  try {
    await seedDatabase();
    await start({ seed: false });

    assert.equal((await request("GET", "/dashboard/stats")).status, 401);
    assert.equal((await request("GET", "/dashboard/stats", undefined, "other")).status, 403);

    const response = await request("GET", "/dashboard/stats", undefined, "reader");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      totalSessions: 0,
      avgNps: 0,
      avgTraction: 0,
      networkOpennessRate: 0,
    });
  } finally {
    await stop();
    await clearRosterTables();
  }
});

test("dashboard stats aggregate all sessions and count external mentors", async () => {
  await clearRosterTables();
  try {
    await seedDatabase();
    const [team] = await db.select({ id: teamsTable.id }).from(teamsTable).limit(1);
    assert.ok(team, "the official roster must contain a team");

    const [externalMentor] = await db.insert(mentorsTable).values({
      name: "Dashboard external mentor",
      email: null,
      expertiseArea: null,
      mentorType: "externo",
    }).returning();
    const [internalMentor] = await db.insert(mentorsTable).values({
      name: "Dashboard internal mentor",
      email: null,
      expertiseArea: null,
      mentorType: "interno",
    }).returning();
    assert.ok(externalMentor);
    assert.ok(internalMentor);

    await db.insert(mentoringSessionsTable).values([
      {
        teamId: team.id,
        mentorId: externalMentor.id,
        sessionType: "principal",
        sessionDate: "2026-03-07",
        teamNps: 9,
        teamActionability: 8,
        mentorCommitment: 8,
        mentorTraction: 7,
        teamFeedbackStrongPoints: "A equipe alinhou a estratégia.",
        teamFeedbackImprovements: "Documentar melhor os experimentos.",
        agreedNextSteps: "Revisar os resultados no próximo encontro.",
        mentorQualitativeAssessment: "Acompanhamento consistente.",
      },
      {
        teamId: team.id,
        mentorId: internalMentor.id,
        sessionType: "externo",
        sessionDate: "2026-03-14",
        teamNps: 8,
        teamActionability: 8,
        mentorCommitment: 9,
        mentorTraction: 10,
        teamFeedbackStrongPoints: "Boa participação dos estudantes.",
        teamFeedbackImprovements: "Detalhar os próximos testes.",
        agreedNextSteps: "Definir os indicadores do teste.",
        mentorQualitativeAssessment: "A equipe respondeu bem às recomendações.",
      },
      {
        teamId: team.id,
        mentorId: internalMentor.id,
        sessionType: "transversal",
        sessionDate: "2026-03-21",
        teamNps: 9,
        teamActionability: 9,
        mentorCommitment: 8,
        mentorTraction: 8,
        teamFeedbackStrongPoints: "A equipe trouxe dados recentes.",
        teamFeedbackImprovements: "Ampliar a validação com usuários.",
        agreedNextSteps: "Executar entrevistas com clientes.",
        mentorQualitativeAssessment: "Evolução clara desde o último encontro.",
      },
    ]);

    await start({ seed: false });
    const response = await request("GET", "/dashboard/stats", undefined, "reader");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      totalSessions: 3,
      avgNps: 8.7,
      avgTraction: 8.3,
      networkOpennessRate: 33.3,
    });
  } finally {
    await stop();
    await clearRosterTables();
  }
});

test("approved users can read complete team session histories in reverse chronological order", async () => {
  await clearRosterTables();
  try {
    await seedDatabase();
    const seededTeams = await db
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .orderBy(teamsTable.id)
      .limit(3);
    const [team, otherTeam, emptyTeam] = seededTeams;
    assert.ok(team);
    assert.ok(otherTeam);
    assert.ok(emptyTeam);

    const [internalMentor] = await db.insert(mentorsTable).values({
      name: "History internal mentor",
      email: null,
      expertiseArea: "Operações & Produto",
      mentorType: "interno",
    }).returning();
    const [externalMentor] = await db.insert(mentorsTable).values({
      name: "History external mentor",
      email: null,
      expertiseArea: "Saúde & Produto",
      mentorType: "externo",
    }).returning();
    assert.ok(internalMentor);
    assert.ok(externalMentor);

    const longQualitativeText = `Relato integral: ${"observação detalhada; ".repeat(420)}`;
    const [olderSession, latestSession] = await db.insert(mentoringSessionsTable).values([
      {
        teamId: team.id,
        mentorId: internalMentor.id,
        sessionType: "principal",
        sessionDate: "2026-03-23",
        teamNps: 7,
        teamActionability: 6,
        mentorCommitment: 8,
        mentorTraction: 7,
        teamFeedbackStrongPoints: "A equipe validou a hipótese inicial.",
        teamFeedbackImprovements: "Amostra de entrevistas ainda pequena.",
        agreedNextSteps: "Concluir entrevistas com usuários.",
        mentorQualitativeAssessment: "Há avanço consistente na validação.",
        createdAt: new Date("2026-03-23T12:00:00.000Z"),
      },
      {
        teamId: team.id,
        mentorId: externalMentor.id,
        sessionType: "transversal",
        sessionDate: "2026-03-24",
        teamNps: 10,
        teamActionability: 9,
        mentorCommitment: 8,
        mentorTraction: 9,
        teamFeedbackStrongPoints: longQualitativeText,
        teamFeedbackImprovements: "Detalhar os critérios de priorização.",
        agreedNextSteps: "Comparar os resultados do próximo experimento.",
        mentorQualitativeAssessment: "A mentora trouxe recomendações práticas.",
        createdAt: new Date("2026-03-24T18:00:00.000Z"),
      },
      {
        teamId: otherTeam.id,
        mentorId: internalMentor.id,
        sessionType: "principal",
        sessionDate: "2026-03-25",
        teamNps: 5,
        teamActionability: 5,
        mentorCommitment: 5,
        mentorTraction: 5,
        teamFeedbackStrongPoints: "Outra equipe.",
        teamFeedbackImprovements: "Outro relato.",
        agreedNextSteps: "Outra tarefa.",
        mentorQualitativeAssessment: "Outro parecer.",
      },
    ]).returning({ id: mentoringSessionsTable.id });
    assert.ok(olderSession);
    assert.ok(latestSession);

    await start({ seed: false });
    const path = `/teams/${team.id}/sessions`;
    assert.equal((await request("GET", path)).status, 401);
    assert.equal((await request("GET", path, undefined, "other")).status, 403);
    assert.equal((await request("GET", "/teams/not-a-number/sessions", undefined, "reader")).status, 400);
    assert.equal((await request("GET", "/teams/999999/sessions", undefined, "reader")).status, 404);

    const history = await request("GET", path, undefined, "reader");
    assert.equal(history.status, 200);
    assert.deepEqual(history.body.map((session: { id: number }) => session.id), [
      latestSession.id,
      olderSession.id,
    ]);
    assert.deepEqual(history.body[0], {
      id: latestSession.id,
      sessionDate: "2026-03-24",
      sessionType: "transversal",
      mentor: {
        id: externalMentor.id,
        name: "History external mentor",
        expertiseArea: "Saúde & Produto",
        mentorType: "externo",
      },
      scores: {
        teamNps: 10,
        teamActionability: 9,
        mentorCommitment: 8,
        mentorTraction: 9,
      },
      qualitative: {
        teamFeedbackStrongPoints: longQualitativeText,
        teamFeedbackImprovements: "Detalhar os critérios de priorização.",
        agreedNextSteps: "Comparar os resultados do próximo experimento.",
        mentorQualitativeAssessment: "A mentora trouxe recomendações práticas.",
      },
      createdAt: "2026-03-24T18:00:00.000Z",
    });

    const emptyHistory = await request("GET", `/teams/${emptyTeam.id}/sessions`, undefined, "reader");
    assert.equal(emptyHistory.status, 200);
    assert.deepEqual(emptyHistory.body, []);
  } finally {
    await stop();
    await clearRosterTables();
  }
});

test("team session history returns 503 when the database is unavailable", async () => {
  await clearRosterTables();
  let queryMock: ReturnType<typeof mock.method> | undefined;
  try {
    await seedDatabase();
    const [team] = await db.select({ id: teamsTable.id }).from(teamsTable).limit(1);
    assert.ok(team);
    await start({ seed: false });

    queryMock = mock.method(pool, "query", async () => {
      throw new Error("simulated database outage");
    });
    assert.deepEqual(
      await request("GET", `/teams/${team.id}/sessions`, undefined, "reader"),
      {
        status: 503,
        body: { error: "Não foi possível carregar o histórico de sessões agora." },
      },
    );
  } finally {
    queryMock?.mock.restore();
    await stop();
    await clearRosterTables();
  }
});

test("administrators can record a transversal session and startup preserves it", async () => 
{

  await clearRosterTables()
;

  try 
{

    await seedDatabase()
;

    await start(
{
 seed: false 
}
)
;


    const team = (await teams())[0]
;

    assert.ok(team)
;

    const otherMentor = (await db.select().from(mentorsTable))
      .find((mentor) => mentor.id !== team.mainMentor.id)
;

    assert.ok(otherMentor)
;


    const sessionInput = 
{

      mentorId: otherMentor.id,
      sessionType: "transversal",
      sessionDate: "2026-04-05",
      teamNps: 9,
      teamActionability: 8,
      mentorCommitment: 7,
      mentorTraction: 9,
      teamFeedbackStrongPoints: "A equipe colaborou com uma perspectiva externa.",
      teamFeedbackImprovements: "Detalhar melhor os critérios de validação.",
      agreedNextSteps: "Comparar os resultados do próximo experimento.",
      mentorQualitativeAssessment: "A conversa trouxe recomendações práticas.",
    
}
;

    const path = `/teams/${team.id}/sessions`
;


    assert.equal((await request("POST", path, sessionInput)).status, 401)
;

    assert.equal((await request("POST", path, sessionInput, "reader")).status, 403)
;

    assert.equal((await request("POST", path, sessionInput, "other")).status, 403)
;

    assert.equal((await request("POST", path, 
{
 ...sessionInput, teamNps: 11 
}
, "admin")).status, 400)
;

    assert.equal((await request("POST", path, 
{
 ...sessionInput, sessionDate: "05/04/2026" 
}
, "admin")).status, 400)
;

    assert.equal((await request("POST", path, 
{
 ...sessionInput, mentorId: 999_999 
}
, "admin")).status, 400)
;

    assert.equal((await request("POST", "/teams/not-a-number/sessions", sessionInput, "admin")).status, 400)
;

    assert.equal((await request("POST", "/teams/999999/sessions", sessionInput, "admin")).status, 404)
;

    assert.equal((await teams()).find((
{
 id 
}
) => id === team.id)?.sessionCount, 0)
;


    const created = await request("POST", path, sessionInput, "admin")
;

    assert.equal(created.status, 201)
;

    assert.equal(created.body.sessionDate, sessionInput.sessionDate)
;

    assert.equal(created.body.sessionType, "transversal")
;

    assert.equal(created.body.mentorId, otherMentor.id)
;

    assert.notEqual(created.body.mentorId, team.mainMentor.id)
;


    const savedBeforeRestart = await db.select().from(mentoringSessionsTable)
      .where(eq(mentoringSessionsTable.teamId, team.id))
;

    assert.equal(savedBeforeRestart.length, 1)
;

    assert.equal((await teams()).find((
{
 id 
}
) => id === team.id)?.sessionCount, 1)
;


    await stop()
;

    await start()
;

    assert.deepEqual(
      await db.select().from(mentoringSessionsTable).where(eq(mentoringSessionsTable.teamId, team.id)),
      savedBeforeRestart,
      "startup must preserve the session registered through the administrator API",
    )
;

    assert.equal((await teams()).find((
{
 id 
}
) => id === team.id)?.sessionCount, 1)
;

  
}
 finally 
{

    await stop()
;

    await clearRosterTables()
;

  
}

}
)
;


test("an official transversal session with another mentor survives startup seeding", async () => 
{

  const 
{
 rows: [
{
 name: databaseName 
}
] 
}
 = await pool.query<
{
 name: string 
}
>(
    "SELECT current_database() AS name",
  )
;

  assert.match(databaseName, /^roster_test_/, "the transversal session must use the disposable test database")
;

  await clearRosterTables()
;

  try 
{

    await seedDatabase()
;

    const official = await rosterSnapshot()
;

    assert.equal(official.mentors.length, officialTeams.length)
;

    assert.equal(official.teams.length, officialTeams.length)
;

    assert.equal(official.students.length, officialTeams.reduce((total, team) => total + team.students.length, 0))
;

    assert.deepEqual(official.sessions, [])
;


    const teamEntry = officialTeams[0]
;

    const transversalMentorEntry = officialTeams.find((
{
 mentor 
}
) => mentor !== teamEntry.mentor)
;

    assert.ok(transversalMentorEntry)
;

    const team = official.teams.find((
{
 name 
}
) => name === teamEntry.name)
;

    const mainMentor = official.mentors.find((
{
 name 
}
) => name === teamEntry.mentor)
;

    const transversalMentor = official.mentors.find((
{
 name 
}
) => name === transversalMentorEntry.mentor)
;

    assert.ok(team)
;

    assert.ok(mainMentor)
;

    assert.ok(transversalMentor)
;

    assert.equal(team.mainMentorId, mainMentor.id)
;

    assert.notEqual(transversalMentor.id, team.mainMentorId)
;


    const [session] = await db.insert(mentoringSessionsTable).values(
{

      teamId: team.id,
      mentorId: transversalMentor.id,
      sessionType: "transversal",
      sessionDate: "2026-03-02",
      teamNps: 8,
      teamActionability: 9,
      mentorCommitment: 8,
      mentorTraction: 9,
      teamFeedbackStrongPoints: "A equipe colaborou bem com outro mentor.",
      teamFeedbackImprovements: "Aprofundar os critérios de validação.",
      agreedNextSteps: "Comparar os resultados do próximo teste.",
      mentorQualitativeAssessment: "A conversa trouxe uma perspectiva complementar.",
    
}
).returning()
;

    assert.equal(session.sessionType, "transversal")
;

    assert.equal(session.mentorId, transversalMentor.id)
;

    assert.notEqual(session.mentorId, team.mainMentorId)
;


    const beforeSeed = await rosterSnapshot()
;

    assert.deepEqual(beforeSeed.sessions, [session], "the cross-team session must exist before startup")
;

    await seedDatabase()
;

    assert.deepEqual(
      await rosterSnapshot(),
      beforeSeed,
      "startup must preserve the official roster and the transversal session's mentor/team links",
    )
;

  
}
 finally 
{

    await clearRosterTables()
;

  
}

}
)
;


test("a failed official roster insert rolls back the complete legacy replacement", async () => 
{

  await clearRosterTables()
;

  let triggerCreated = false
;

  let functionCreated = false
;

  try 
{

    const 
{
 rows: [
{
 name: databaseName 
}
] 
}
 = await pool.query<
{
 name: string 
}
>(
      "SELECT current_database() AS name",
    )
;

    assert.match(databaseName, /^roster_test_/, "this failure test must use run.mjs's disposable database")
;


    const legacy = await insertLegacyDemo()
;

    const beforeSeed = await rosterSnapshot()
;

    assert.equal(beforeSeed.mentors.length, legacyDemoMentors.length)
;

    assert.equal(beforeSeed.teams.length, legacyDemoTeams.length)
;

    assert.equal(beforeSeed.students.length, 0)
;

    assert.equal(beforeSeed.sessions.length, legacyDemoTeams.length * 3)
;


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
    `)
;

    functionCreated = true
;

    await pool.query(`
      CREATE TRIGGER roster_test_fail_official_student_insert
      BEFORE INSERT ON students
      FOR EACH ROW
      EXECUTE FUNCTION roster_test_fail_official_student_insert()
    `)
;

    triggerCreated = true
;


    await assert.rejects(seedDatabase(), (error: unknown) => 
{

      let cause = error
;

      while (cause instanceof Error) 
{

        if (cause.message.includes("simulated official roster insert failure")) return true
;

        cause = cause.cause
;

      
}

      return false
;

    
}
)
;


    const afterFailure = await rosterSnapshot()
;

    assert.deepEqual(afterFailure, beforeSeed, "all legacy mentors, teams and sessions must survive")
;

    assert.deepEqual(afterFailure.mentors, legacy.mentors)
;

    assert.deepEqual(afterFailure.teams, legacy.teams)
;

    assert.deepEqual(afterFailure.sessions, legacy.sessions)
;

    assert.deepEqual(afterFailure.students, [], "no students from a partial official roster may remain")
;

    assert.equal(afterFailure.mentors.some((
{
 name 
}
) =>
      officialTeams.some((
{
 mentor 
}
) => mentor === name)
    ), false, "official mentors inserted before the failure must be rolled back")
;

    assert.equal(afterFailure.teams.some((
{
 name 
}
) =>
      officialTeams.some((
{
 name: officialName 
}
) => officialName === name)
    ), false, "official teams inserted before the failure must be rolled back")
;


    await pool.query("DROP TRIGGER roster_test_fail_official_student_insert ON students")
;

    triggerCreated = false
;

    await pool.query("DROP FUNCTION roster_test_fail_official_student_insert()")
;

    functionCreated = false
;


    await seedDatabase()
;

    const afterRetry = await rosterSnapshot()
;

    const expectedOfficial = await officialRoster()
;

    const mentorNameById = new Map(afterRetry.mentors.map((
{
 id, name 
}
) => [id, name]))
;

    const teamNameById = new Map(afterRetry.teams.map((
{
 id, name 
}
) => [id, name]))
;


    assert.deepEqual(
      afterRetry.mentors.map((
{
 name 
}
) => name).sort(),
      expectedOfficial.map((
{
 mentor 
}
) => mentor).sort(),
      "retry must install every official mentor",
    )
;

    assert.deepEqual(
      afterRetry.teams.map((
{
 name, mainMentorId 
}
) => (
{

        team: name,
        mentor: mentorNameById.get(mainMentorId)!,
      
}
)).sort((a, b) => a.team.localeCompare(b.team)),
      expectedOfficial.map((
{
 equipe, mentor 
}
) => (
{
 team: equipe, mentor 
}
))
        .sort((a, b) => a.team.localeCompare(b.team)),
      "retry must install every official team and mentor assignment",
    )
;

    assert.deepEqual(
      afterRetry.students.map((
{
 teamId, name, sortOrder 
}
) => (
{

        team: teamNameById.get(teamId)!,
        name,
        sortOrder,
      
}
)).sort((a, b) => a.team.localeCompare(b.team) || a.sortOrder - b.sortOrder),
      expectedOfficial.flatMap((
{
 equipe, integrantes 
}
) =>
        integrantes.map((name, sortOrder) => (
{
 team: equipe, name, sortOrder 
}
))
      ).sort((a, b) => a.team.localeCompare(b.team) || a.sortOrder - b.sortOrder),
      "retry must install every official student in the correct order",
    )
;

    assert.deepEqual(afterRetry.sessions, [], "retry must remove all legacy sessions")
;

  
}
 finally 
{

    if (triggerCreated) 
{

      await pool.query("DROP TRIGGER roster_test_fail_official_student_insert ON students")
;

    
}

    if (functionCreated) 
{

      await pool.query("DROP FUNCTION roster_test_fail_official_student_insert()")
;

    
}

    await clearRosterTables()
;

  
}

}
)
;


test("a failed first official roster import rolls back and succeeds on retry", async () => 
{

  await clearRosterTables()
;

  let triggerCreated = false
;

  let functionCreated = false
;

  try 
{

    const 
{
 rows: [
{
 name: databaseName 
}
] 
}
 = await pool.query<
{
 name: string 
}
>(
      "SELECT current_database() AS name",
    )
;

    assert.match(databaseName, /^roster_test_/, "first-import failure must use run.mjs's disposable database")
;


    const beforeSeed = await rosterSnapshot()
;

    assert.deepEqual(beforeSeed, 
{
 mentors: [], teams: [], students: [], sessions: [] 
}
)
;


    await pool.query(`
      CREATE FUNCTION roster_test_fail_first_official_student_insert()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.sort_order = 1 THEN
          RAISE EXCEPTION 'simulated first official roster insert failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `)
;

    functionCreated = true
;

    await pool.query(`
      CREATE TRIGGER roster_test_fail_first_official_student_insert
      BEFORE INSERT ON students
      FOR EACH ROW
      EXECUTE FUNCTION roster_test_fail_first_official_student_insert()
    `)
;

    triggerCreated = true
;


    await assert.rejects(seedDatabase(), (error: unknown) => 
{

      let cause = error
;

      while (cause instanceof Error) 
{

        if (cause.message.includes("simulated first official roster insert failure")) return true
;

        cause = cause.cause
;

      
}

      return false
;

    
}
)
;


    assert.deepEqual(
      await rosterSnapshot(),
      beforeSeed,
      "a failed first import must roll back all mentors, teams, students, and sessions",
    )
;

    const 
{
 rows: [
{
 count: heldRosterLocks 
}
] 
}
 = await pool.query<
{
 count: number 
}
>(`
      SELECT count(*)::int AS count
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND granted
        AND classid = 0
        AND objid = 732941
        AND objsubid = 1
    `)
;

    assert.equal(heldRosterLocks, 0, "a failed seed transaction must release the roster lock")
;


    await pool.query("DROP TRIGGER roster_test_fail_first_official_student_insert ON students")
;

    triggerCreated = false
;

    await pool.query("DROP FUNCTION roster_test_fail_first_official_student_insert()")
;

    functionCreated = false
;


    await seedDatabase()
;

    const afterRetry = await rosterSnapshot()
;

    const expectedOfficial = await officialRoster()
;

    const mentorNameById = new Map(afterRetry.mentors.map((
{
 id, name 
}
) => [id, name]))
;

    const teamNameById = new Map(afterRetry.teams.map((
{
 id, name 
}
) => [id, name]))
;


    assert.deepEqual(
      afterRetry.mentors.map((
{
 name 
}
) => name).sort(),
      expectedOfficial.map((
{
 mentor 
}
) => mentor).sort(),
      "retry must install every official mentor",
    )
;

    assert.deepEqual(
      afterRetry.teams.map((
{
 name, mainMentorId 
}
) => (
{

        team: name,
        mentor: mentorNameById.get(mainMentorId)!,
      
}
)).sort((a, b) => a.team.localeCompare(b.team)),
      expectedOfficial.map((
{
 equipe, mentor 
}
) => (
{
 team: equipe, mentor 
}
))
        .sort((a, b) => a.team.localeCompare(b.team)),
      "retry must install every official team and mentor assignment",
    )
;

    assert.deepEqual(
      afterRetry.students.map((
{
 teamId, name, sortOrder 
}
) => (
{

        team: teamNameById.get(teamId)!,
        name,
        sortOrder,
      
}
)).sort((a, b) => a.team.localeCompare(b.team) || a.sortOrder - b.sortOrder),
      expectedOfficial.flatMap((
{
 equipe, integrantes 
}
) =>
        integrantes.map((name, sortOrder) => (
{
 team: equipe, name, sortOrder 
}
))
      ).sort((a, b) => a.team.localeCompare(b.team) || a.sortOrder - b.sortOrder),
      "retry must install every official student in the correct order",
    )
;

    assert.deepEqual(afterRetry.sessions, [], "retry must not create mentoring sessions")
;

  
}
 finally 
{

    if (triggerCreated) 
{

      await pool.query("DROP TRIGGER roster_test_fail_first_official_student_insert ON students")
;

    
}

    if (functionCreated) 
{

      await pool.query("DROP FUNCTION roster_test_fail_first_official_student_insert()")
;

    
}

    await clearRosterTables()
;

  
}

}
)
;


test("official document, seed and API agree on every mentor, team, student and order", async () => 
{

  const expected = await officialRoster()
;

  assert.deepEqual(officialTeams.map((
{
 name, mentor, students 
}
) => (
{

    equipe: name, mentor, integrantes: [...students],
  
}
)), expected.map((
{
 equipe, mentor, integrantes 
}
) => (
{
 equipe, mentor, integrantes 
}
)))
;


  await start()
;

  try 
{

    const first = await teams()
;

    const expectedRoster = expected.map((
{
 equipe, mentor, integrantes 
}
) => (
{

      equipe, mentor, integrantes,
      ordens: integrantes.map((_, index) => index),
      sessoes: 0,
    
}
))
;

    assert.deepEqual(rosterProjection(first), expectedRoster, "API must return all official pairs and ordered names")
;


    const mentors = await db.select().from(mentorsTable)
;

    const storedTeams = await db.select().from(teamsTable)
;

    const students = await db.select().from(studentsTable)
;

    assert.equal(mentors.length, 8, "no additional or missing mentors")
;

    assert.equal(storedTeams.length, 8, "no additional or missing teams")
;

    assert.equal(students.length, 29, "no additional, missing or duplicated students")
;

    assert.deepEqual(await db.select().from(mentoringSessionsTable), [], "seed must not invent sessions")
;

    assert.deepEqual(
      [...storedTeams].sort((a, b) => a.id - b.id).map((team) => (
{

        equipe: team.name,
        mentor: mentors.find((
{
 id 
}
) => id === team.mainMentorId)?.name,
        integrantes: students.filter((
{
 teamId 
}
) => teamId === team.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((
{
 name, sortOrder 
}
) => (
{
 name, sortOrder 
}
)),
      
}
)),
      expected.map((
{
 equipe, mentor, integrantes 
}
) => (
{

        equipe, mentor, integrantes: integrantes.map((name, sortOrder) => (
{
 name, sortOrder 
}
)),
      
}
)),
      "database links and positions must agree with the source document",
    )
;


    await seedDatabase()
;

    assert.deepEqual(await teams(), first, "second seed must not change API rows or identifiers")
;

    assert.deepEqual(await db.select().from(mentorsTable), mentors, "second seed must preserve mentors")
;

    assert.deepEqual(await db.select().from(teamsTable), storedTeams, "second seed must preserve teams")
;

    assert.deepEqual(await db.select().from(studentsTable), students, "second seed must preserve students")
;

    assert.deepEqual(await db.select().from(mentoringSessionsTable), [], "second seed must not add sessions")
;

  
}
 finally 
{

    await stop()
;

  
}

}
)
;


test("concurrent startup seeds serialize across separate database connections", async () => 
{

  const 
{
 rows: [
{
 name: databaseName 
}
] 
}
 = await pool.query<
{
 name: string 
}
>(
    "SELECT current_database() AS name",
  )
;

  assert.match(databaseName, /^roster_test_/, "concurrent seed test must use run.mjs's disposable database")
;

  await clearRosterTables()
;


  let releaseBlocker!: () => void
;

  let signalLockAcquired!: () => void
;

  const blockerRelease = new Promise<void>((resolve) => 
{
 releaseBlocker = resolve
;
 
}
)
;

  const lockAcquired = new Promise<void>((resolve) => 
{
 signalLockAcquired = resolve
;
 
}
)
;

  const blocker = db.transaction(async (tx) => 
{

    await tx.execute(rosterWriteLock)
;

    signalLockAcquired()
;

    await blockerRelease
;

  
}
)
;

  const seedRuns: Promise<void>[] = []
;


  try 
{

    await lockAcquired
;

    let settledSeeds = 0
;

    seedRuns.push(seedDatabase().finally(() => 
{
 settledSeeds += 1
;
 
}
))
;

    seedRuns.push(seedDatabase().finally(() => 
{
 settledSeeds += 1
;
 
}
))
;


    const deadline = Date.now() + 5_000
;

    let waitingBackendPids: number[] = []
;

    while (Date.now() < deadline) 
{

      const 
{
 rows 
}
 = await pool.query<
{
 pid: number 
}
>(`
        SELECT pid::int AS pid
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND NOT granted
          AND classid = 0
          AND objid = 732941
          AND objsubid = 1
        ORDER BY pid
      `)
;

      waitingBackendPids = rows.map((
{
 pid 
}
) => pid)
;

      if (waitingBackendPids.length === 2) break
;

      assert.equal(settledSeeds, 0, "both startup seeds must wait for the shared roster lock")
;

      await new Promise((resolve) => setTimeout(resolve, 10))
;

    
}

    assert.equal(waitingBackendPids.length, 2, "both seed transactions must wait for the shared roster lock")
;

    assert.equal(
      new Set(waitingBackendPids).size,
      2,
      "the concurrent seed transactions must use separate PostgreSQL connections",
    )
;


    releaseBlocker()
;

    await Promise.all(seedRuns)
;


    const official = await rosterSnapshot()
;

    const mentorNameById = new Map(official.mentors.map((
{
 id, name 
}
) => [id, name]))
;

    const expectedMentors = officialTeams.map((
{
 mentor 
}
) => mentor).sort()
;

    assert.deepEqual(official.mentors.map((
{
 name 
}
) => name).sort(), expectedMentors)
;

    assert.equal(official.teams.length, officialTeams.length, "there must be exactly one official team per entry")
;

    assert.equal(
      official.students.length,
      officialTeams.reduce((count, team) => count + team.students.length, 0),
      "there must be exactly the official students, without duplicates",
    )
;

    assert.deepEqual(
      official.teams.map((team) => (
{

        name: team.name,
        mentor: mentorNameById.get(team.mainMentorId),
        students: official.students
          .filter((
{
 teamId 
}
) => teamId === team.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((
{
 name, sortOrder 
}
) => (
{
 name, sortOrder 
}
)),
      
}
)).sort((a, b) => a.name.localeCompare(b.name)),
      officialTeams.map((
{
 name, mentor, students 
}
) => (
{

        name,
        mentor,
        students: students.map((studentName, sortOrder) => (
{
 name: studentName, sortOrder 
}
)),
      
}
)).sort((a, b) => a.name.localeCompare(b.name)),
      "concurrent seeds must leave the exact official mentor/team/student relationships and ordering",
    )
;

    assert.deepEqual(official.sessions, [], "concurrent seeds must not create mentoring sessions")
;

  
}
 finally 
{

    releaseBlocker()
;

    await blocker
;

    await Promise.allSettled(seedRuns)
;

    await clearRosterTables()
;

  
}

}
)
;


test("concurrent startup replaces the legacy demo once across separate database connections", async () => 
{

  const 
{
 rows: [
{
 name: databaseName 
}
] 
}
 = await pool.query<
{
 name: string 
}
>(
    "SELECT current_database() AS name",
  )
;

  assert.match(databaseName, /^roster_test_/, "concurrent legacy migration must use run.mjs's disposable database")
;

  await clearRosterTables()
;


  let releaseBlocker!: () => void
;

  let signalLockAcquired!: () => void
;

  const blockerRelease = new Promise<void>((resolve) => 
{
 releaseBlocker = resolve
;
 
}
)
;

  const lockAcquired = new Promise<void>((resolve) => 
{
 signalLockAcquired = resolve
;
 
}
)
;

  const blocker = db.transaction(async (tx) => 
{

    await tx.execute(rosterWriteLock)
;

    signalLockAcquired()
;

    await blockerRelease
;

  
}
)
;

  const seedRuns: Promise<void>[] = []
;


  try 
{

    const legacy = await insertLegacyDemo()
;

    assert.equal(legacy.mentors.length, legacyDemoMentors.length)
;

    assert.equal(legacy.teams.length, legacyDemoTeams.length)
;

    assert.equal(legacy.students.length, 0)
;

    assert.equal(legacy.sessions.length, legacyDemoTeams.length * 3)
;

    await lockAcquired
;


    let settledSeeds = 0
;

    seedRuns.push(seedDatabase().finally(() => 
{
 settledSeeds += 1
;
 
}
))
;

    seedRuns.push(seedDatabase().finally(() => 
{
 settledSeeds += 1
;
 
}
))
;


    const deadline = Date.now() + 5_000
;

    let waitingBackendPids: number[] = []
;

    while (Date.now() < deadline) 
{

      const 
{
 rows 
}
 = await pool.query<
{
 pid: number 
}
>(`
        SELECT pid::int AS pid
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND NOT granted
          AND classid = 0
          AND objid = 732941
          AND objsubid = 1
        ORDER BY pid
      `)
;

      waitingBackendPids = rows.map((
{
 pid 
}
) => pid)
;

      if (waitingBackendPids.length === 2) break
;

      assert.equal(settledSeeds, 0, "both legacy migrations must wait for the shared roster lock")
;

      await new Promise((resolve) => setTimeout(resolve, 10))
;

    
}

    assert.equal(waitingBackendPids.length, 2, "both legacy seed transactions must wait for the shared roster lock")
;

    assert.equal(
      new Set(waitingBackendPids).size,
      2,
      "the concurrent legacy seed transactions must use separate PostgreSQL connections",
    )
;


    releaseBlocker()
;

    await Promise.all(seedRuns)
;


    const official = await rosterSnapshot()
;

    const mentorNameById = new Map(official.mentors.map((
{
 id, name 
}
) => [id, name]))
;

    assert.deepEqual(
      official.mentors.map((
{
 name 
}
) => name).sort(),
      officialTeams.map((
{
 mentor 
}
) => mentor).sort(),
      "the legacy mentors must be replaced by exactly the official mentor set",
    )
;

    assert.equal(official.teams.length, officialTeams.length, "there must be exactly one official team per entry")
;

    assert.equal(
      official.students.length,
      officialTeams.reduce((count, team) => count + team.students.length, 0),
      "there must be exactly the official students, without duplicates",
    )
;

    assert.deepEqual(
      official.teams.map((team) => (
{

        name: team.name,
        mentor: mentorNameById.get(team.mainMentorId),
        students: official.students
          .filter((
{
 teamId 
}
) => teamId === team.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((
{
 name, sortOrder 
}
) => (
{
 name, sortOrder 
}
)),
      
}
)).sort((a, b) => a.name.localeCompare(b.name)),
      officialTeams.map((
{
 name, mentor, students 
}
) => (
{

        name,
        mentor,
        students: students.map((studentName, sortOrder) => (
{
 name: studentName, sortOrder 
}
)),
      
}
)).sort((a, b) => a.name.localeCompare(b.name)),
      "the concurrent legacy migration must leave exact official relationships and ordering",
    )
;

    assert.deepEqual(official.sessions, [], "the legacy sessions must be removed without concurrent errors")
;

  
}
 finally 
{

    releaseBlocker()
;

    await blocker
;

    await Promise.allSettled(seedRuns)
;

    await clearRosterTables()
;

  
}

}
)
;


test("a student edit concurrent with startup seed is serialized and preserved", async () => 
{

  await clearRosterTables()
;

  await seedDatabase()
;

  await start(
{
 seed: false 
}
)
;


  let releaseBlocker!: () => void
;

  let signalLockAcquired!: () => void
;

  const blockerRelease = new Promise<void>((resolve) => 
{
 releaseBlocker = resolve
;
 
}
)
;

  const lockAcquired = new Promise<void>((resolve) => 
{
 signalLockAcquired = resolve
;
 
}
)
;

  const blocker = db.transaction(async (tx) => 
{

    await tx.execute(rosterWriteLock)
;

    signalLockAcquired()
;

    await blockerRelease
;

  
}
)
;


  let seedRun: Promise<void> | undefined
;

  let editRun: Promise<
{
 status: number
;
 body: unknown 
}
> | undefined
;

  try 
{

    await lockAcquired
;

    const before = await rosterSnapshot()
;

    const team = (await teams())[0]
;

    assert.ok(team, "the initial official seed must include a team")
;

    const student = team.students[0]
;

    assert.ok(student, "the chosen team must include a student")
;

    const updatedName = `${student.name} (editada durante a inicialização)`
;


    let seedSettled = false
;

    let editSettled = false
;

    seedRun = seedDatabase().finally(() => 
{
 seedSettled = true
;
 
}
)
;

    editRun = request(
      "PATCH",
      `/teams/${team.id}/students/${student.id}`,
      
{
 expectedName: student.name, name: updatedName 
}
,
      "admin",
    ).finally(() => 
{
 editSettled = true
;
 
}
)
;


    const deadline = Date.now() + 5_000
;

    let waitingOperations = 0
;

    while (Date.now() < deadline) 
{

      const 
{
 rows: [
{
 count 
}
] 
}
 = await pool.query<
{
 count: number 
}
>(`
        SELECT count(*)::int AS count
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND NOT granted
          AND classid = 0
          AND objid = 732941
          AND objsubid = 1
      `)
;

      waitingOperations = count
;

      if (waitingOperations === 2) break
;

      assert.equal(seedSettled, false, "startup seed must wait for the shared roster lock")
;

      assert.equal(editSettled, false, "administrative edit must wait for the shared roster lock")
;

      await new Promise((resolve) => setTimeout(resolve, 10))
;

    
}

    assert.equal(waitingOperations, 2, "both concurrent operations must wait on the roster lock")
;


    releaseBlocker()
;

    const [_, response] = await Promise.all([seedRun, editRun])
;

    assert.equal(response.status, 200)
;

    assert.equal((response.body as 
{
 name: string 
}
).name, updatedName)
;


    const expected = 
{

      ...before,
      students: before.students.map((row) =>
        row.id === student.id ? 
{
 ...row, name: updatedName 
}
 : row
      ),
    
}
;

    assert.deepEqual(await rosterSnapshot(), expected, "the only roster change must be the administrator's edit")
;

    assert.equal(expected.mentors.length, officialTeams.length, "seed must not duplicate mentors")
;

    assert.equal(expected.teams.length, officialTeams.length, "seed must not duplicate teams")
;

    assert.equal(
      expected.students.length,
      officialTeams.reduce((total, entry) => total + entry.students.length, 0),
      "seed must not duplicate or remove students",
    )
;

    assert.deepEqual(expected.sessions, [], "startup seed must not create mentoring sessions")
;

  
}
 finally 
{

    releaseBlocker()
;

    await blocker
;

    const pendingOperations: Promise<unknown>[] = []
;

    if (seedRun) pendingOperations.push(seedRun)
;

    if (editRun) pendingOperations.push(editRun)
;

    await Promise.allSettled(pendingOperations)
;

    await stop()
;

    await clearRosterTables()
;

  
}

}
)
;


test("a student addition concurrent with startup seed is serialized and preserved", async () => 
{

  await clearRosterTables()
;

  const 
{
 rows: [
{
 name: databaseName 
}
] 
}
 = await pool.query<
{
 name: string 
}
>(
    "SELECT current_database() AS name",
  )
;

  assert.match(databaseName, /^roster_test_/, "concurrent student addition must use the disposable test database")
;

  await seedDatabase()
;

  await start(
{
 seed: false 
}
)
;


  let releaseBlocker!: () => void
;

  let signalLockAcquired!: () => void
;

  const blockerRelease = new Promise<void>((resolve) => 
{
 releaseBlocker = resolve
;
 
}
)
;

  const lockAcquired = new Promise<void>((resolve) => 
{
 signalLockAcquired = resolve
;
 
}
)
;

  const blocker = db.transaction(async (tx) => 
{

    await tx.execute(rosterWriteLock)
;

    signalLockAcquired()
;

    await blockerRelease
;

  
}
)
;


  let seedRun: Promise<void> | undefined
;

  let additionRun: Promise<
{
 status: number
;
 body: unknown 
}
> | undefined
;

  try 
{

    await lockAcquired
;

    const before = await rosterSnapshot()
;

    const team = (await teams())[0]
;

    assert.ok(team, "the initial official seed must include a team")
;

    const teamStudents = before.students.filter((
{
 teamId 
}
) => teamId === team.id)
;

    const nextSortOrder = Math.max(-1, ...teamStudents.map((
{
 sortOrder 
}
) => sortOrder)) + 1
;

    const addedName = "Estudante incluído durante a inicialização"
;


    let seedSettled = false
;

    let additionSettled = false
;

    seedRun = seedDatabase().finally(() => 
{
 seedSettled = true
;
 
}
)
;

    additionRun = request(
      "POST",
      `/teams/${team.id}/students`,
      
{
 name: addedName 
}
,
      "admin",
    ).finally(() => 
{
 additionSettled = true
;
 
}
)
;


    const deadline = Date.now() + 5_000
;

    let waitingOperations = 0
;

    while (Date.now() < deadline) 
{

      const 
{
 rows: [
{
 count 
}
] 
}
 = await pool.query<
{
 count: number 
}
>(`
        SELECT count(*)::int AS count
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND NOT granted
          AND classid = 0
          AND objid = 732941
          AND objsubid = 1
      `)
;

      waitingOperations = count
;

      if (waitingOperations === 2) break
;

      assert.equal(seedSettled, false, "startup seed must wait for the shared roster lock")
;

      assert.equal(additionSettled, false, "student addition must wait for the shared roster lock")
;

      await new Promise((resolve) => setTimeout(resolve, 10))
;

    
}

    assert.equal(waitingOperations, 2, "both concurrent operations must wait on the roster lock")
;


    releaseBlocker()
;

    const [_, response] = await Promise.all([seedRun, additionRun])
;

    assert.equal(response.status, 201)
;

    const addedStudent = response.body as 
{

      id: number
;
 name: string
;
 sortOrder: number
;

    
}
;

    assert.ok(Number.isInteger(addedStudent.id) && addedStudent.id > 0)
;

    assert.deepEqual(response.body, 
{

      id: addedStudent.id,
      name: addedName,
      sortOrder: nextSortOrder,
    
}
, "student creation must return only the documented response fields")
;


    const after = await rosterSnapshot()
;

    const insertedRow = after.students.find((
{
 id 
}
) => id === addedStudent.id)
;

    assert.ok(insertedRow, "the administrator's student must be saved")
;

    assert.equal(insertedRow.teamId, team.id)
;

    assert.equal(insertedRow.name, addedName)
;

    assert.equal(insertedRow.sortOrder, nextSortOrder)
;

    assert.deepEqual(after.mentors, before.mentors, "startup must not change mentors")
;

    assert.deepEqual(after.teams, before.teams, "startup must not change teams")
;

    assert.deepEqual(after.sessions, before.sessions, "startup must not change sessions")
;

    assert.deepEqual(
      after.students.filter((
{
 id 
}
) => id !== addedStudent.id),
      before.students,
      "the only new student row must be the administrator's addition",
    )
;

    assert.equal(after.students.length, before.students.length + 1)
;

    assert.equal(after.mentors.length, before.mentors.length)
;

    assert.equal(after.teams.length, before.teams.length)
;

    assert.equal(after.sessions.length, before.sessions.length)
;

    assert.equal(
      after.students.filter((
{
 name 
}
) => name === addedName).length,
      1,
      "the newly added student must appear exactly once",
    )
;

  
}
 finally 
{

    releaseBlocker()
;

    await blocker
;

    const pendingOperations: Promise<unknown>[] = []
;

    if (seedRun) pendingOperations.push(seedRun)
;

    if (additionRun) pendingOperations.push(additionRun)
;

    await Promise.allSettled(pendingOperations)
;

    await stop()
;

    await clearRosterTables()
;

  
}

}
)
;


test("a student deletion concurrent with startup seed is serialized and preserved", async () => 
{

  await clearRosterTables()
;

  const 
{
 rows: [
{
 name: databaseName 
}
] 
}
 = await pool.query<
{
 name: string 
}
>(
    "SELECT current_database() AS name",
  )
;

  assert.match(databaseName, /^roster_test_/, "concurrent student deletion must use the disposable test database")
;

  await seedDatabase()
;

  await start(
{
 seed: false 
}
)
;


  let releaseBlocker!: () => void
;

  let signalLockAcquired!: () => void
;

  const blockerRelease = new Promise<void>((resolve) => 
{
 releaseBlocker = resolve
;
 
}
)
;

  const lockAcquired = new Promise<void>((resolve) => 
{
 signalLockAcquired = resolve
;
 
}
)
;

  const blocker = db.transaction(async (tx) => 
{

    await tx.execute(rosterWriteLock)
;

    signalLockAcquired()
;

    await blockerRelease
;

  
}
)
;


  let seedRun: Promise<void> | undefined
;

  let deletionRun: Promise<
{
 status: number
;
 body: unknown 
}
> | undefined
;

  try 
{

    await lockAcquired
;

    const before = await rosterSnapshot()
;

    const team = (await teams())[0]
;

    assert.ok(team, "the initial official seed must include a team")
;

    const student = team.students[team.students.length - 1]
;

    assert.ok(student, "the chosen team must include a student")
;

    assert.equal(
      student.sortOrder,
      Math.max(...team.students.map((
{
 sortOrder 
}
) => sortOrder)),
      "delete the last student so no other student needs reordering",
    )
;

    assert.ok(before.students.some((
{
 id 
}
) => id === student.id))
;

    const expectedRemainingStudents = before.students.filter((
{
 id 
}
) => id !== student.id)
;


    let seedSettled = false
;

    let deletionSettled = false
;

    deletionRun = request(
      "DELETE",
      `/teams/${team.id}/students/${student.id}`,
      
{
 expectedName: student.name 
}
,
      "admin",
    ).finally(() => 
{
 deletionSettled = true
;
 
}
)
;


    const waitingRosterOperations = async () => 
{

      const 
{
 rows: [
{
 count 
}
] 
}
 = await pool.query<
{
 count: number 
}
>(`
        SELECT count(*)::int AS count
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND NOT granted
          AND classid = 0
          AND objid = 732941
          AND objsubid = 1
      `)
;

      return count
;

    
}
;

    let waitingOperations = 0
;

    const deletionDeadline = Date.now() + 5_000
;

    while (Date.now() < deletionDeadline) 
{

      waitingOperations = await waitingRosterOperations()
;

      if (waitingOperations === 1) break
;

      assert.equal(deletionSettled, false, "student deletion must wait for the shared roster lock")
;

      await new Promise((resolve) => setTimeout(resolve, 10))
;

    
}

    assert.equal(waitingOperations, 1, "student deletion must queue before startup seed")
;


    seedRun = seedDatabase().finally(() => 
{
 seedSettled = true
;
 
}
)
;

    const seedDeadline = Date.now() + 5_000
;

    while (Date.now() < seedDeadline) 
{

      waitingOperations = await waitingRosterOperations()
;

      if (waitingOperations === 2) break
;

      assert.equal(seedSettled, false, "startup seed must wait for the shared roster lock")
;

      assert.equal(deletionSettled, false, "student deletion must wait for the shared roster lock")
;

      await new Promise((resolve) => setTimeout(resolve, 10))
;

    
}

    assert.equal(waitingOperations, 2, "both concurrent operations must wait on the roster lock")
;


    releaseBlocker()
;

    const [_, response] = await Promise.all([seedRun, deletionRun])
;

    assert.equal(response.status, 204)
;


    const after = await rosterSnapshot()
;

    assert.deepEqual(after.mentors, before.mentors, "startup must not change mentors")
;

    assert.deepEqual(after.teams, before.teams, "startup must not change teams")
;

    assert.deepEqual(
      after.students,
      expectedRemainingStudents,
      "the deleted student must stay absent and all other student rows must remain unchanged",
    )
;

    assert.deepEqual(after.sessions, before.sessions, "startup must not change sessions")
;

    assert.equal(after.students.some((
{
 id 
}
) => id === student.id), false)
;

    assert.equal(after.students.length, before.students.length - 1)
;

    assert.equal(after.mentors.length, before.mentors.length)
;

    assert.equal(after.teams.length, before.teams.length)
;

    assert.equal(after.sessions.length, before.sessions.length)
;

  
}
 finally 
{

    releaseBlocker()
;

    await blocker
;

    const pendingOperations: Promise<unknown>[] = []
;

    if (seedRun) pendingOperations.push(seedRun)
;

    if (deletionRun) pendingOperations.push(deletionRun)
;

    await Promise.allSettled(pendingOperations)
;

    await stop()
;

    await clearRosterTables()
;

  
}

}
)
;


test("a team edit concurrent with startup seed is serialized and preserved", async () => 
{

  await clearRosterTables()
;

  await seedDatabase()
;

  await start(
{
 seed: false 
}
)
;


  let releaseBlocker!: () => void
;

  let signalLockAcquired!: () => void
;

  const blockerRelease = new Promise<void>((resolve) => 
{
 releaseBlocker = resolve
;
 
}
)
;

  const lockAcquired = new Promise<void>((resolve) => 
{
 signalLockAcquired = resolve
;
 
}
)
;

  const blocker = db.transaction(async (tx) => 
{

    await tx.execute(rosterWriteLock)
;

    signalLockAcquired()
;

    await blockerRelease
;

  
}
)
;


  let seedRun: Promise<void> | undefined
;

  let editRun: Promise<
{
 status: number
;
 body: unknown 
}
> | undefined
;

  try 
{

    await lockAcquired
;

    const before = await rosterSnapshot()
;

    const team = (await teams())[0]
;

    assert.ok(team, "the initial official seed must include a team")
;

    const updatedName = `${team.name} (editada durante a inicialização)`
;


    let seedSettled = false
;

    let editSettled = false
;

    seedRun = seedDatabase().finally(() => 
{
 seedSettled = true
;
 
}
)
;

    editRun = request(
      "PATCH",
      `/teams/${team.id}`,
      
{
 ...confirmation(team), name: updatedName 
}
,
      "admin",
    ).finally(() => 
{
 editSettled = true
;
 
}
)
;


    const deadline = Date.now() + 5_000
;

    let waitingOperations = 0
;

    while (Date.now() < deadline) 
{

      const 
{
 rows: [
{
 count 
}
] 
}
 = await pool.query<
{
 count: number 
}
>(`
        SELECT count(*)::int AS count
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND NOT granted
          AND classid = 0
          AND objid = 732941
          AND objsubid = 1
      `)
;

      waitingOperations = count
;

      if (waitingOperations === 2) break
;

      assert.equal(seedSettled, false, "startup seed must wait for the shared roster lock")
;

      assert.equal(editSettled, false, "administrative edit must wait for the shared roster lock")
;

      await new Promise((resolve) => setTimeout(resolve, 10))
;

    
}

    assert.equal(waitingOperations, 2, "both concurrent operations must wait on the roster lock")
;


    releaseBlocker()
;

    const [_, response] = await Promise.all([seedRun, editRun])
;

    assert.equal(response.status, 200)
;

    assert.equal((response.body as 
{
 name: string 
}
).name, updatedName)
;


    const expected = 
{

      ...before,
      teams: before.teams.map((row) =>
        row.id === team.id ? 
{
 ...row, name: updatedName 
}
 : row
      ),
    
}
;

    assert.deepEqual(await rosterSnapshot(), expected, "the only roster change must be the administrator's edit")
;

    assert.equal(expected.mentors.length, officialTeams.length, "seed must not duplicate mentors")
;

    assert.equal(expected.teams.length, officialTeams.length, "seed must not duplicate or remove teams")
;

    assert.equal(
      expected.students.length,
      officialTeams.reduce((total, entry) => total + entry.students.length, 0),
      "seed must not duplicate or remove students",
    )
;

    assert.deepEqual(expected.sessions, [], "startup seed must not create mentoring sessions")
;

  
}
 finally 
{

    releaseBlocker()
;

    await blocker
;

    const pendingOperations: Promise<unknown>[] = []
;

    if (seedRun) pendingOperations.push(seedRun)
;

    if (editRun) pendingOperations.push(editRun)
;

    await Promise.allSettled(pendingOperations)
;

    await stop()
;

    await clearRosterTables()
;

  
}

}
)
;


test("roster writes survive boot; permissions and stale confirmations protect data", async () => 
{

  await start()
;

  try 
{

    const original = await teams()
;

    assert.ok(original.length > 1, "official seed must populate the isolated database")
;

    const originalTeam = original[0]
;

    const originalStudent = originalTeam.students[0]
;

    assert.ok(originalStudent)
;

    const otherMentorId = original.find((team) => team.mainMentor.id !== originalTeam.mainMentor.id)!.mainMentor.id
;


    const writeCases = [
      ["POST", "/teams", 
{
 name: "Bloqueada", mainMentorId: otherMentorId, students: [] 
}
],
      ["PATCH", `/teams/${originalTeam.id}`, 
{
 ...confirmation(originalTeam), name: "Bloqueada" 
}
],
      ["DELETE", `/teams/${originalTeam.id}`, confirmation(originalTeam)],
      ["POST", `/teams/${originalTeam.id}/students`, 
{
 name: "Bloqueado" 
}
],
      ["PATCH", `/teams/${originalTeam.id}/students/${originalStudent.id}`, 
{
 expectedName: originalStudent.name, name: "Bloqueado" 
}
],
      ["DELETE", `/teams/${originalTeam.id}/students/${originalStudent.id}`, 
{
 expectedName: originalStudent.name 
}
],
    ] as const
;

    for (const [method, path, body] of writeCases) 
{

      assert.equal((await request(method, path, body)).status, 401, `${method} ${path}: no session`)
;

      assert.equal((await request(method, path, body, "reader")).status, 403, `${method} ${path}: reader`)
;

      assert.equal((await request(method, path, body, "other")).status, 403, `${method} ${path}: unapproved`)
;

    
}

    assert.deepEqual(await teams(), original, "rejected requests must not write")
;


    const created = await request("POST", "/teams", 
{

      name: "Equipe temporária", mainMentorId: originalTeam.mainMentor.id, students: ["Inicial"],
    
}
, "admin")
;

    assert.equal(created.status, 201)
;

    const newTeam = created.body as Team
;

    const added = await request("POST", `/teams/${originalTeam.id}/students`, 
{
 name: "Nova integrante" 
}
, "admin")
;

    assert.equal(added.status, 201)
;

    const newStudent = added.body as 
{
 id: number
;
 name: string 
}
;

    const renamed = await request("PATCH", `/teams/${originalTeam.id}/students/${newStudent.id}`, 
{

      expectedName: newStudent.name, name: "Integrante renomeada",
    
}
, "admin")
;

    assert.equal(renamed.status, 200)
;

    assert.equal((await request("PATCH", `/teams/${originalTeam.id}/students/${newStudent.id}`, 
{

      expectedName: newStudent.name, name: "Perdida",
    
}
, "admin")).status, 409)
;

    assert.equal((await request("DELETE", `/teams/${originalTeam.id}/students/${newStudent.id}`, 
{

      expectedName: newStudent.name,
    
}
, "admin")).status, 409)
;


    const changedTeam = await request("PATCH", `/teams/${originalTeam.id}`, 
{

      ...confirmation(originalTeam), name: "Equipe atualizada", mainMentorId: otherMentorId,
    
}
, "admin")
;

    assert.equal(changedTeam.status, 200)
;

    assert.equal((changedTeam.body as Team).mainMentor.id, otherMentorId)
;

    assert.equal((await request("PATCH", `/teams/${originalTeam.id}`, 
{

      ...confirmation(originalTeam), name: "Sobrescrita",
    
}
, "admin")).status, 409)
;

    assert.equal((await request("DELETE", `/teams/${originalTeam.id}`, confirmation(originalTeam), "admin")).status, 409)
;


    const current = (await teams()).find((team) => team.id === originalTeam.id)!
;

    assert.equal((await request("DELETE", `/teams/${originalTeam.id}`, 
{

      ...confirmation(current), expectedStudents: originalTeam.students,
    
}
, "admin")).status, 409, "old student list cannot confirm team deletion")
;

    assert.equal((await request("DELETE", `/teams/${originalTeam.id}/students/${originalStudent.id}`, 
{

      expectedName: originalStudent.name,
    
}
, "admin")).status, 204)
;

    assert.equal((await request("DELETE", `/teams/${newTeam.id}`, confirmation(newTeam), "admin")).status, 204)
;

    assert.equal((await request("DELETE", `/teams/${newTeam.id}`, confirmation(newTeam), "admin")).status, 404)
;


    const protectedTeam = await request("POST", "/teams", 
{

      name: "Equipe com sessão", mainMentorId: otherMentorId, students: [],
    
}
, "admin")
;

    assert.equal(protectedTeam.status, 201)
;

    const protectedId = (protectedTeam.body as Team).id
;

    await db.insert(mentoringSessionsTable).values(
{

      teamId: protectedId, mentorId: otherMentorId, sessionType: "principal",
      sessionDate: "2026-01-01", teamNps: 8, teamActionability: 8,
      mentorCommitment: 8, mentorTraction: 8,
      teamFeedbackStrongPoints: "Bom", teamFeedbackImprovements: "Melhorar",
      agreedNextSteps: "Continuar", mentorQualitativeAssessment: "Bom",
    
}
)
;

    assert.equal((await request("DELETE", `/teams/${protectedId}`, confirmation(protectedTeam.body as Team), "admin")).status, 409)
;

    assert.equal((await db.select().from(mentoringSessionsTable).where(eq(mentoringSessionsTable.teamId, protectedId))).length, 1)
;


    const beforeRestart = await teams()
;

    await stop()
;

    await start()
;
 // rerun the real seed routine against the same persistent database
    assert.deepEqual(await teams(), beforeRestart, "boot must preserve creates, edits, deletions and sessions")
;

    assert.equal((await db.select().from(teamsTable).where(eq(teamsTable.id, newTeam.id))).length, 0)
;

    assert.equal((await db.select().from(studentsTable).where(and(
      eq(studentsTable.id, originalStudent.id), eq(studentsTable.teamId, originalTeam.id),
    ))).length, 0)
;

    assert.equal((await db.select().from(mentorsTable)).length, original.length, "seed must not duplicate mentors")
;

    assert.equal((await db.select().from(mentoringSessionsTable).where(eq(mentoringSessionsTable.teamId, protectedId))).length, 1)
;


    // Delete an original official team too: a later boot must not recreate it.
    const deletable = (await teams()).find((team) => team.id !== protectedId && team.id !== originalTeam.id)!
;

    assert.equal((await request("DELETE", `/teams/${deletable.id}`, confirmation(deletable), "admin")).status, 204)
;

    await stop()
;

    await start()
;

    assert.ok(!(await teams()).some((team) => team.id === deletable.id))
;


    // Even an incomplete/mismatched official roster must never be "repaired"
    // by deleting unknown records or recreating previously removed rows.
    const retained = (await teams()).find((team) => team.students.length > 0)!
;

    await db.update(studentsTable).set(
{
 name: "Nome corrigido pela equipe" 
}
)
      .where(eq(studentsTable.id, retained.students[0].id))
;

    const beforeUnknownSeed = 
{

      mentors: await db.select().from(mentorsTable),
      teams: await db.select().from(teamsTable),
      students: await db.select().from(studentsTable),
      sessions: await db.select().from(mentoringSessionsTable),
    
}
;

    await seedDatabase()
;

    assert.deepEqual(await db.select().from(mentorsTable), beforeUnknownSeed.mentors)
;

    assert.deepEqual(await db.select().from(teamsTable), beforeUnknownSeed.teams)
;

    assert.deepEqual(await db.select().from(studentsTable), beforeUnknownSeed.students)
;

    assert.deepEqual(await db.select().from(mentoringSessionsTable), beforeUnknownSeed.sessions)
;

    assert.ok(!(await teams()).some((team) => team.id === deletable.id))
;

  
}
 finally 
{

    await stop()
;

  
}

}
)
;
