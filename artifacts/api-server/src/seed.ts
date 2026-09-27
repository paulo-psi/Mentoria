import { inArray, sql } from "drizzle-orm";
import {
  db,
  mentorsTable,
  teamsTable,
  mentoringSessionsTable,
  studentsTable,
  insertMentorSchema,
  insertTeamSchema,
  insertStudentSchema,
} from "@workspace/db";
import { logger } from "./lib/logger";
import { officialTeams } from "./official-data";

const legacyDemoMentors = [
  { name: "Ana Beatriz Costa", email: "ana.costa@example.org", expertiseArea: "Growth & Marketing", mentorType: "interno" },
  { name: "Bruno Almeida", email: "bruno.almeida@example.org", expertiseArea: "Finanças & Pricing", mentorType: "interno" },
  { name: "Camila Rezende", email: "camila.rezende@example.org", expertiseArea: "Produto & UX", mentorType: "interno" },
  { name: "Diego Martins", email: "diego.martins@example.org", expertiseArea: "Tecnologia & Arquitetura", mentorType: "interno" },
  { name: "Elisa Nogueira", email: "elisa.nogueira@example.org", expertiseArea: "Operações & Processos", mentorType: "interno" },
  { name: "Felipe Rocha", email: "felipe.rocha@example.org", expertiseArea: "Vendas B2B", mentorType: "interno" },
  { name: "Gabriela Torres", email: "gabriela.torres@example.org", expertiseArea: "Dados & Métricas", mentorType: "interno" },
  { name: "Henrique Lima", email: "henrique.lima@example.org", expertiseArea: "Jurídico & Governança", mentorType: "interno" },
  { name: "Isabela Duarte", email: "isabela.duarte@example.org", expertiseArea: "ESG & Impacto", mentorType: "externo" },
  { name: "João Pedro Farias", email: "joao.farias@example.org", expertiseArea: "Expansão Internacional", mentorType: "externo" },
] as const;

const legacyDemoTeams = [
  {
    name: "Verdeira",
    pitchSummary: "Conecta pequenos produtores a restaurantes com previsão de demanda para reduzir perdas de alimentos.",
    currentStage: "Validação de Problema",
    strongPoint: "proximidade com produtores locais e entendimento das perdas na cadeia",
    improvement: "a frequência de compra dos restaurantes e a disposição para pagar",
    nextStep: "entrevistar cinco restaurantes e registrar volumes desperdiçados",
    assessment: "A proposta tem dor concreta, mas depende de validar recorrência e logística antes de ampliar o catálogo",
  },
  {
    name: "ClariSaúde",
    pitchSummary: "Organiza rotinas de cuidado e teleorientação para pacientes com doenças crônicas.",
    currentStage: "Prototipação",
    strongPoint: "escuta cuidadosa dos pacientes e desenho acessível do acompanhamento",
    improvement: "os limites clínicos da teleorientação e o fluxo de encaminhamento",
    nextStep: "testar o protótipo com seis pacientes e uma profissional de saúde",
    assessment: "Há clareza sobre o público inicial; a segurança do atendimento e o consentimento precisam ser detalhados",
  },
  {
    name: "Rota Clara",
    pitchSummary: "Otimiza entregas compartilhadas para o comércio de bairro com rotas de baixo custo.",
    currentStage: "Tração Inicial",
    strongPoint: "conhecimento operacional do comércio local e primeiros pilotos pagos",
    improvement: "a previsibilidade de demanda nos horários de pico",
    nextStep: "medir pontualidade e custo por entrega em três bairros",
    assessment: "A operação já mostra adesão; o próximo gargalo é manter a qualidade ao aumentar o volume",
  },
  {
    name: "AprendeJá",
    pitchSummary: "Cria trilhas de estudo personalizadas a partir de dados de aprendizagem das escolas.",
    currentStage: "Validação de Problema",
    strongPoint: "hipóteses pedagógicas bem articuladas e acesso a professores para pesquisa",
    improvement: "o tempo de configuração exigido das escolas",
    nextStep: "acompanhar duas turmas e mapear o esforço de implantação",
    assessment: "O problema é relevante, mas a equipe deve provar ganho de aprendizagem antes de vender a personalização",
  },
  {
    name: "Ciclo Vivo",
    pitchSummary: "Rastreia embalagens retornáveis e oferece logística reversa para marcas regionais.",
    currentStage: "Prototipação",
    strongPoint: "parcerias iniciais com marcas e visão completa do ciclo das embalagens",
    improvement: "o custo da coleta e as taxas reais de retorno",
    nextStep: "executar um piloto de cinquenta embalagens e medir retornos",
    assessment: "A solução tem potencial de impacto; a viabilidade econômica depende da densidade dos pontos de coleta",
  },
  {
    name: "Preço Certo",
    pitchSummary: "Ajuda microvarejistas a definir preços e acompanhar margens sem planilhas complexas.",
    currentStage: "Tração Inicial",
    strongPoint: "onboarding simples e evidências de melhoria na margem de lojas piloto",
    improvement: "a integração de custos variáveis e impostos na sugestão de preço",
    nextStep: "comparar preços sugeridos e margem efetiva em dez produtos",
    assessment: "Existe valor percebido pelos lojistas; a precisão financeira precisa acompanhar o crescimento da base",
  },
  {
    name: "Nexo Energia",
    pitchSummary: "Monitora o consumo de energia de pequenas empresas e recomenda ações de economia.",
    currentStage: "Prototipação",
    strongPoint: "visualização clara do consumo e acesso a dados de empresas piloto",
    improvement: "a comprovação das economias atribuíveis às recomendações",
    nextStep: "definir linha de base e acompanhar três recomendações por cliente",
    assessment: "O protótipo é promissor; separar variações sazonais do efeito do produto é essencial",
  },
  {
    name: "Ponte Talento",
    pitchSummary: "Conecta jovens técnicos a projetos de empresas locais com trilhas de preparação.",
    currentStage: "Tração Inicial",
    strongPoint: "rede ativa de escolas e empresas com vagas concretas",
    improvement: "a medição de permanência dos jovens após a colocação",
    nextStep: "acompanhar os primeiros contratados e entrevistar seus gestores",
    assessment: "Há sinais de demanda dos dois lados; retenção e acompanhamento pós-contratação serão diferenciais",
  },
] as const;

type MentorRow = typeof mentorsTable.$inferSelect;
type TeamRow = typeof teamsTable.$inferSelect;
type SessionRow = typeof mentoringSessionsTable.$inferSelect;
type StudentRow = typeof studentsTable.$inferSelect;

function matchesOfficialDataset(mentors: MentorRow[], teams: TeamRow[], students: StudentRow[]): boolean {
  const expectedStudentCount = officialTeams.reduce((total, team) => total + team.students.length, 0);
  if (mentors.length < officialTeams.length || teams.length < officialTeams.length || students.length < expectedStudentCount) {
    return false;
  }

  const mentorNameById = new Map(mentors.map((mentor): [number, string] => [mentor.id, mentor.name]));
  const teamIdByName = new Map(teams.map((team): [string, number] => [team.name, team.id]));
  const registeredStudents = new Set(students.map((student) =>
    `${student.teamId}\u0000${student.sortOrder}\u0000${student.name}`,
  ));
  for (const expected of officialTeams) {
    const actual = teams.find((team) => team.name === expected.name);
    if (!actual || mentorNameById.get(actual.mainMentorId) !== expected.mentor) return false;
    const teamId = teamIdByName.get(expected.name);
    if (expected.students.some((name, sortOrder) =>
      !registeredStudents.has(`${teamId}\u0000${sortOrder}\u0000${name}`)
    )) return false;
  }
  return true;
}

function legacySessionPayloads(
  mentorIdByName: Map<string, number>,
  teamIdByName: Map<string, number>,
) {
  return legacyDemoTeams.flatMap((team, index) =>
    [0, 1, 2].map((week) => {
      const external = week === 2 && index % 2 === 0;
      const mentorIndex = external ? 8 + ((index / 2) % 2) : week === 1 ? (index + 2) % 8 : index;
      return {
        teamId: teamIdByName.get(team.name)!,
        mentorId: mentorIdByName.get(legacyDemoMentors[mentorIndex].name)!,
        sessionType: week === 0 ? "principal" : external ? "externo" : week === 1 ? "transversal" : "principal",
        teamNps: Math.min(10, 6 + (index % 3) + week),
        teamActionability: Math.min(10, 5 + (index % 4) + week),
        mentorCommitment: Math.min(10, 6 + ((index + 1) % 3) + week),
        mentorTraction: Math.min(10, 5 + ((index + 2) % 4) + week),
        teamFeedbackStrongPoints: `Na semana ${week + 1}, a equipe destacou ${team.strongPoint}. Os exemplos apresentados ajudaram a conectar a discussão às necessidades reais dos usuários.`,
        teamFeedbackImprovements: `A equipe precisa aprofundar ${team.improvement}. Faltam critérios objetivos para comparar o resultado do próximo teste com a hipótese inicial.`,
        agreedNextSteps: `Até a próxima sessão, ${team.nextStep}. A equipe compartilhará as evidências, o responsável e o prazo de cada entrega.`,
        mentorQualitativeAssessment: `${team.assessment}. Nesta sessão, o mentor recomendou reduzir o escopo do experimento e documentar os aprendizados antes da próxima decisão.`,
      };
    }),
  );
}

function matchesLegacySession(actual: SessionRow, expected: ReturnType<typeof legacySessionPayloads>[number]): boolean {
  return actual.teamId === expected.teamId &&
    actual.mentorId === expected.mentorId &&
    actual.sessionType === expected.sessionType &&
    actual.teamNps === expected.teamNps &&
    actual.teamActionability === expected.teamActionability &&
    actual.mentorCommitment === expected.mentorCommitment &&
    actual.mentorTraction === expected.mentorTraction &&
    actual.teamFeedbackStrongPoints === expected.teamFeedbackStrongPoints &&
    actual.teamFeedbackImprovements === expected.teamFeedbackImprovements &&
    actual.agreedNextSteps === expected.agreedNextSteps &&
    actual.mentorQualitativeAssessment === expected.mentorQualitativeAssessment;
}

function matchesLegacyDemoDataset(
  mentors: MentorRow[],
  teams: TeamRow[],
  sessions: SessionRow[],
  students: StudentRow[],
): boolean {
  if (
    mentors.length !== legacyDemoMentors.length ||
    teams.length !== legacyDemoTeams.length ||
    sessions.length !== legacyDemoTeams.length * 3 ||
    students.length !== 0
  ) return false;

  const mentorIdByName = new Map(mentors.map((mentor): [string, number] => [mentor.name, mentor.id]));
  for (const expected of legacyDemoMentors) {
    const actual = mentors.find((mentor) => mentor.name === expected.name);
    if (
      !actual ||
      actual.email !== expected.email ||
      actual.expertiseArea !== expected.expertiseArea ||
      actual.mentorType !== expected.mentorType
    ) return false;
  }

  const teamIdByName = new Map(teams.map((team): [string, number] => [team.name, team.id]));
  for (const [index, expected] of legacyDemoTeams.entries()) {
    const actual = teams.find((team) => team.name === expected.name);
    if (
      !actual ||
      actual.mainMentorId !== mentorIdByName.get(legacyDemoMentors[index].name) ||
      actual.pitchSummary !== expected.pitchSummary ||
      actual.currentStage !== expected.currentStage
    ) return false;
  }

  // Match every generated feedback/score/mentor combination, not just row counts or names.
  // Date and identity columns vary between installations and are not seed identifiers.
  const unmatched = legacySessionPayloads(mentorIdByName, teamIdByName);
  for (const session of sessions) {
    const index = unmatched.findIndex((expected) => matchesLegacySession(session, expected));
    if (index === -1) return false;
    unmatched.splice(index, 1);
  }
  return unmatched.length === 0;
}

export async function seedDatabase(): Promise<void> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(732941)`);

    // A transaction uses one PostgreSQL client, so keep queries sequential.
    const mentors = await tx.select().from(mentorsTable);
    const teams = await tx.select().from(teamsTable);
    const sessions = await tx.select().from(mentoringSessionsTable);
    const students = await tx.select().from(studentsTable);

    if (matchesOfficialDataset(mentors, teams, students)) return "already-official";

    if (
      mentors.length !== 0 ||
      teams.length !== 0 ||
      sessions.length !== 0 ||
      students.length !== 0
    ) {
      if (!matchesLegacyDemoDataset(mentors, teams, sessions, students)) {
        // Do not replace unknown records or prevent an otherwise healthy API from starting.
        return "unrecognized";
      }

      await tx.delete(mentoringSessionsTable).where(inArray(mentoringSessionsTable.id, sessions.map(({ id }) => id)));
      await tx.delete(teamsTable).where(inArray(teamsTable.id, teams.map(({ id }) => id)));
      await tx.delete(mentorsTable).where(inArray(mentorsTable.id, mentors.map(({ id }) => id)));
    }

    const insertedMentors = await tx
      .insert(mentorsTable)
      .values(officialTeams.map(({ mentor }) => insertMentorSchema.parse({
        name: mentor,
        email: null,
        expertiseArea: null,
        mentorType: null,
      })))
      .returning();
    const mentorIdByName = new Map(insertedMentors.map((mentor): [string, number] => [mentor.name, mentor.id]));

    const insertedTeams = await tx
      .insert(teamsTable)
      .values(officialTeams.map((team) => insertTeamSchema.parse({
        name: team.name,
        pitchSummary: null,
        currentStage: null,
        mainMentorId: mentorIdByName.get(team.mentor),
      })))
      .returning();
    const teamIdByName = new Map(insertedTeams.map((team): [string, number] => [team.name, team.id]));

    await tx.insert(studentsTable).values(
      officialTeams.flatMap((team) =>
        team.students.map((name, sortOrder) => insertStudentSchema.parse({
          teamId: teamIdByName.get(team.name),
          name,
          sortOrder,
        })),
      ),
    );
    return mentors.length === 0 ? "seeded" : "replaced-demo";
  });

  if (result === "unrecognized") {
    logger.warn("Existing mentoring data is not the known demo seed; import skipped and all records preserved");
  } else if (result === "already-official") {
    logger.info("Official PIBEP 2026 data already exists; seed skipped");
  } else {
    logger.info({
      mentors: officialTeams.length,
      teams: officialTeams.length,
      students: officialTeams.reduce((total, team) => total + team.students.length, 0),
      removedDemoSessions: result === "replaced-demo" ? legacyDemoTeams.length * 3 : 0,
    }, "Official PIBEP 2026 mentoring data ready");
  }
}