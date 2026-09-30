import { expect, test } from '@playwright/test';

const screenshotDir = '/tmp/hub-guide-captures';

const teams = [
  {
    id: 1,
    name: 'Equipe Aurora',
    pitchSummary: 'Organização simples para pequenos negócios',
    currentStage: 'Validação',
    createdAt: '2026-01-15T12:00:00.000Z',
    mainMentor: { id: 11, name: 'Marina Exemplo', email: null, expertiseArea: 'Estratégia', mentorType: 'interno' },
    students: [
      { id: 101, name: 'Lia Demonstração', sortOrder: 0 },
      { id: 102, name: 'Caio Fictício', sortOrder: 1 },
    ],
    sessionCount: 1,
    totalSessions: 1,
    transversalSessionCount: 0,
    lastSessionDate: '2026-03-24',
    lastSessionScore: 9,
    latestAgreedNextSteps: 'Conversar com cinco pessoas sobre a solução.',
  },
  {
    id: 2,
    name: 'Equipe Ipê',
    pitchSummary: 'Apoio para hortas comunitárias',
    currentStage: 'Descoberta',
    createdAt: '2026-01-16T12:00:00.000Z',
    mainMentor: { id: 12, name: 'Rafael Modelo', email: null, expertiseArea: 'Produto', mentorType: 'interno' },
    students: [{ id: 103, name: 'Joana Fictícia', sortOrder: 0 }],
    sessionCount: 0,
    totalSessions: 0,
    transversalSessionCount: 0,
    lastSessionDate: null,
    lastSessionScore: null,
    latestAgreedNextSteps: null,
  },
  {
    id: 3,
    name: 'Equipe Horizonte',
    pitchSummary: 'Ferramentas para aprendizagem acessível',
    currentStage: 'Protótipo',
    createdAt: '2026-01-17T12:00:00.000Z',
    mainMentor: { id: 11, name: 'Marina Exemplo', email: null, expertiseArea: 'Estratégia', mentorType: 'interno' },
    students: [{ id: 104, name: 'Alex Demonstração', sortOrder: 0 }],
    sessionCount: 2,
    totalSessions: 2,
    transversalSessionCount: 1,
    lastSessionDate: '2026-03-21',
    lastSessionScore: 8,
    latestAgreedNextSteps: 'Testar o protótipo com novas pessoas.',
  },
];

const mentors = [
  {
    id: 11,
    name: 'Marina Exemplo',
    email: 'marina@example.invalid',
    expertiseArea: 'Estratégia e Produto',
    mentorType: 'interno',
    totalSessions: 3,
    avgNpsReceived: 8.8,
    assignedTeamsCount: 2,
  },
  {
    id: 12,
    name: 'Rafael Modelo',
    email: 'rafael@example.invalid',
    expertiseArea: 'Tecnologia e Operações',
    mentorType: 'interno',
    totalSessions: 1,
    avgNpsReceived: 9,
    assignedTeamsCount: 1,
  },
  {
    id: 13,
    name: 'Luiza Demonstração',
    email: 'luiza@example.invalid',
    expertiseArea: 'Comunicação',
    mentorType: 'externo',
    totalSessions: 2,
    avgNpsReceived: 8.5,
    assignedTeamsCount: 0,
  },
];

const sessions = [
  {
    id: 301,
    sessionDate: '2026-03-24',
    sessionType: 'principal',
    mentor: { id: 11, name: 'Marina Exemplo', expertiseArea: 'Estratégia e Produto', mentorType: 'interno' },
    scores: { teamNps: 9, teamActionability: 8, mentorCommitment: 10, mentorTraction: 7 },
    qualitative: {
      mentorQualitativeAssessment: 'A equipe apresentou avanços claros na validação da proposta.',
      teamFeedbackStrongPoints: 'Comunicação clara e colaboração durante a conversa.',
      teamFeedbackImprovements: 'Ampliar a amostra de entrevistas.',
      agreedNextSteps: 'Conversar com cinco pessoas sobre a solução até sexta-feira.',
    },
    createdAt: '2026-03-24T15:00:00.000Z',
  },
];

const auditEvents = [
  {
    id: 501,
    summary: 'Equipe renomeada de “Equipe Aurora” para “Equipe Aurora”',
    teamId: 1,
    studentId: null,
    createdAt: '2026-03-25T15:00:00.000Z',
    actorEmail: 'admin@example.invalid',
  },
];

test('captura telas demonstrativas para o guia', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });

  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    let data: unknown;
    if (pathname === '/api/access') data = { canManage: true };
    else if (pathname === '/api/healthz') data = { status: 'ok' };
    else if (pathname === '/api/health') data = { status: 'ok', database: 'connected' };
    else if (pathname === '/api/dashboard/stats') {
      data = { totalSessions: 6, avgNps: 8.7, avgTraction: 8.2, networkOpennessRate: 66.7 };
    } else if (pathname === '/api/teams') data = teams;
    else if (pathname === '/api/mentors') data = mentors;
    else if (pathname === '/api/teams/1/sessions') data = sessions;
    else if (pathname === '/api/roster-audit') data = auditEvents;
    else data = { error: 'Rota não prevista na captura demonstrativa.' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });

  await page.goto('/');
  await expect(page.getByText('Acesso restrito')).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/01-acesso.jpg`, type: 'jpeg', quality: 78 });
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar como pessoa de teste' }).click();
  await expect(page).toHaveURL(/\/user-portal$/);
  await expect(page.getByTestId('row-equipe-1')).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/02-equipes.jpg`, type: 'jpeg', quality: 78 });

  await page.getByPlaceholder('Buscar equipe, mentor ou estudante').fill('Aurora');
  await expect(page.getByTestId('row-equipe-1')).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/03-busca.jpg`, type: 'jpeg', quality: 78 });
  await page.getByPlaceholder('Buscar equipe, mentor ou estudante').fill('');
  await page.getByRole('tab', { name: /Mentores/ }).click();
  await expect(page.getByTestId('table-mentors')).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/04-mentores.jpg`, type: 'jpeg', quality: 78 });

  await page.getByRole('tab', { name: /Equipes/ }).click();
  await page.getByTestId('button-ver-dossie-1').click();
  await expect(page.getByTestId('drawer-dossie-equipe')).toBeVisible();
  await expect(page.getByTestId('sessao-mentoria-301')).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/05-dossie.jpg`, type: 'jpeg', quality: 78 });
  await page.getByTestId('button-fechar-dossie').click();

  await page.getByTestId('button-novo-registro').click();
  await expect(page.getByTestId('modal-novo-registro')).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/06-nova-sessao.jpg`, type: 'jpeg', quality: 78 });
  await page.getByTestId('scroll-novo-registro').evaluate((node) => { node.scrollTop = 780; });
  await page.screenshot({ path: `${screenshotDir}/07-avaliacao-sessao.jpg`, type: 'jpeg', quality: 78 });
  await page.keyboard.press('Escape');

  await page.getByTestId('link-manter-equipes').click();
  await expect(page).toHaveURL(/\/manage$/);
  await page.getByTestId('button-selecionar-equipe-1').click();
  await expect(page.getByTestId('button-salvar-equipe')).toBeVisible();
  await page.screenshot({ path: `${screenshotDir}/08-manutencao.jpg`, type: 'jpeg', quality: 78, fullPage: true });
  await page.getByTestId('historico-relacao').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${screenshotDir}/09-historico.jpg`, type: 'jpeg', quality: 78 });
});