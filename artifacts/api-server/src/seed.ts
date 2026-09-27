import { count, sql } from "drizzle-orm";
import {
  db,
  mentorsTable,
  teamsTable,
  mentoringSessionsTable,
  insertMentorSchema,
  insertTeamSchema,
  insertMentoringSessionSchema,
} from "@workspace/db";
import { logger } from "./lib/logger";

const mentors = [
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

const teams = [
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

function dateDaysAgo(days: number): string {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() - days);
  return [
    day.getFullYear(),
    String(day.getMonth() + 1).padStart(2, "0"),
    String(day.getDate()).padStart(2, "0"),
  ].join("-");
}

export async function seedDatabase(): Promise<void> {
  const seeded = await db.transaction(async (tx) => {
    // The lock prevents two simultaneous server starts from seeding the same empty database.
    await tx.execute(sql`select pg_advisory_xact_lock(732941)`);

    // A transaction uses one PostgreSQL client, so queries must be awaited in order.
    const [mentorCount] = await tx.select({ total: count() }).from(mentorsTable);
    const [teamCount] = await tx.select({ total: count() }).from(teamsTable);
    const [sessionCount] = await tx.select({ total: count() }).from(mentoringSessionsTable);

    if (mentorCount.total || teamCount.total || sessionCount.total) return false;

    const insertedMentors = await tx
      .insert(mentorsTable)
      .values(mentors.map((mentor) => insertMentorSchema.parse(mentor)))
      .returning();

    const insertedTeams = await tx
      .insert(teamsTable)
      .values(
        teams.map((team, index) =>
          insertTeamSchema.parse({
            name: team.name,
            pitchSummary: team.pitchSummary,
            mainMentorId: insertedMentors[index].id,
            currentStage: team.currentStage,
          }),
        ),
      )
      .returning();

    const sessions = teams.flatMap((team, index) =>
      [0, 1, 2].map((week) => {
        const external = week === 2 && index % 2 === 0;
        const sessionType = week === 0 ? "principal" : external ? "externo" : week === 1 ? "transversal" : "principal";
        const mentorId = external
          ? insertedMentors[8 + ((index / 2) % 2)].id
          : week === 1
            ? insertedMentors[(index + 2) % 8].id
            : insertedMentors[index].id;

        return insertMentoringSessionSchema.parse({
          teamId: insertedTeams[index].id,
          mentorId,
          sessionType,
          sessionDate: dateDaysAgo(17 - week * 7 + (index % 3)),
          teamNps: Math.min(10, 6 + (index % 3) + week),
          teamActionability: Math.min(10, 5 + (index % 4) + week),
          mentorCommitment: Math.min(10, 6 + ((index + 1) % 3) + week),
          mentorTraction: Math.min(10, 5 + ((index + 2) % 4) + week),
          teamFeedbackStrongPoints: `Na semana ${week + 1}, a equipe destacou ${team.strongPoint}. Os exemplos apresentados ajudaram a conectar a discussão às necessidades reais dos usuários.`,
          teamFeedbackImprovements: `A equipe precisa aprofundar ${team.improvement}. Faltam critérios objetivos para comparar o resultado do próximo teste com a hipótese inicial.`,
          agreedNextSteps: `Até a próxima sessão, ${team.nextStep}. A equipe compartilhará as evidências, o responsável e o prazo de cada entrega.`,
          mentorQualitativeAssessment: `${team.assessment}. Nesta sessão, o mentor recomendou reduzir o escopo do experimento e documentar os aprendizados antes da próxima decisão.`,
        });
      }),
    );

    await tx.insert(mentoringSessionsTable).values(sessions);
    return true;
  });

  if (seeded) {
    logger.info({ mentors: mentors.length, teams: teams.length, sessions: teams.length * 3 }, "Initial mentoring data seeded");
  } else {
    logger.info("Mentoring data already exists; initial seed skipped");
  }
}