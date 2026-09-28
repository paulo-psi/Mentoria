import { expect, test, type Page } from '@playwright/test';
import type { Student, Team } from '@workspace/api-client-react';

async function mockRosterApi(page: Page, canManage = true, { accessFails = false }: { accessFails?: boolean } = {}) {
  const team: Team = {
    id: 1,
    name: 'Equipe Horizonte',
    pitchSummary: null,
    currentStage: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    mainMentor: {
      id: 1,
      name: 'Mentora de Teste',
      email: null,
      expertiseArea: null,
      mentorType: null,
    },
    students: [{ id: 1, name: 'Ana Lima', sortOrder: 0 }],
    sessionCount: 0,
  };
  const createdNames: string[] = [];
  const sessionRequests: Array<Record<string, unknown>> = [];
  const renameRequests: Array<{ name: string; expectedName: string }> = [];
  const mutationRequests: string[] = [];
  const unexpectedRequests: string[] = [];

  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    if (method !== 'GET') mutationRequests.push(`${method} ${pathname}`);
    let data: unknown;
    let status = 200;

    if (method === 'GET' && pathname === '/api/access') {
      if (accessFails) {
        status = 503;
        data = { error: 'Permission check unavailable' };
      } else {
        data = { canManage };
      }
    }
    else if (method === 'GET' && pathname === '/api/healthz') data = { status: 'ok' };
    else if (method === 'GET' && pathname === '/api/health') data = { status: 'ok', database: 'connected' };
    else if (method === 'GET' && pathname === '/api/teams') data = [team];
    else if (method === 'GET' && pathname === '/api/mentors') data = [
      { id: 1, name: 'Mentora de Teste' },
      { id: 2, name: 'Mentor Transversal' },
    ];
    else if (method === 'GET' && pathname === '/api/roster-audit') data = [];
    else if (canManage && method === 'POST' && pathname === '/api/teams/1/sessions') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      sessionRequests.push(body);
      team.sessionCount += 1;
      status = 201;
      data = { id: 1, teamId: 1, ...body, createdAt: '2026-03-01T12:00:00.000Z' };
    }
    else if (canManage && method === 'POST' && pathname === '/api/teams/1/students') {
      const body = route.request().postDataJSON() as { name: string };
      createdNames.push(body.name);
      const student: Student = { id: 2, name: body.name, sortOrder: team.students.length };
      team.students.push(student);
      status = 201;
      data = student;
    } else if (canManage && method === 'PATCH' && pathname === '/api/teams/1/students/1') {
      const body = route.request().postDataJSON() as { name: string; expectedName: string };
      renameRequests.push(body);
      if (body.expectedName !== team.students[0].name) {
        status = 409;
        data = { error: 'O estudante mudou em outra sessão. Atualize a relação antes de salvar novamente.' };
      } else {
        const student: Student = { ...team.students[0], name: body.name };
        team.students[0] = student;
        data = student;
      }
    } else {
      unexpectedRequests.push(`${method} ${pathname}`);
      status = 501;
      data = { error: `Unexpected browser-test request: ${method} ${pathname}` };
    }

    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });

  return {
    createdNames,
    sessionRequests,
    renameRequests,
    mutationRequests,
    unexpectedRequests,
    changeStudentName: (name: string) => { team.students[0] = { ...team.students[0], name }; },
  };
}

test('signed-out visitor reaches sign-in but not the private roster', async ({ page }) => {
  const apiCalls: string[] = [];
  await page.route('**/api/**', async (route) => {
    apiCalls.push(route.request().url());
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Sign in required"}' });
  });

  await page.goto('/manage');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Acesso restrito')).toBeVisible();
  await expect(page.getByText('Conferência das equipes')).toHaveCount(0);
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByTestId('browser-test-sign-in')).toBeVisible();
  expect(apiCalls, 'private API should not load before sign-in').toEqual([]);
});

test('signed-in view-only user can see the roster but cannot open maintenance', async ({ page }) => {
  const api = await mockRosterApi(page, false);

  await page.goto('/');
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar como pessoa de teste' }).click();
  await expect(page).toHaveURL(/\/user-portal$/);
  await expect(page.getByTestId('card-equipe-1')).toBeVisible();
  await expect(page.getByTestId('link-manter-equipes')).toHaveCount(0);

  await page.goto('/manage');
  await expect(page).toHaveURL(/\/manage$/);
  await expect(page.getByTestId('state-sem-permissao-manage')).toContainText('Manutenção restrita');
  await expect(page.getByTestId('button-nova-equipe')).toHaveCount(0);
  await expect(page.getByTestId('button-selecionar-equipe-1')).toHaveCount(0);
  await expect(page.getByTestId('button-salvar-equipe')).toHaveCount(0);
  await expect(page.getByTestId('button-salvar-sessao-1')).toHaveCount(0);
  expect(api.mutationRequests, 'view-only navigation must not change the roster').toEqual([]);
  expect(api.unexpectedRequests, 'all data must stay within the mocked API').toEqual([]);
});

test('failed permission check keeps maintenance unavailable to a signed-in user', async ({ page }) => {
  const api = await mockRosterApi(page, true, { accessFails: true });

  await page.goto('/');
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  const failedAccess = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/access' && response.status() === 503,
  );
  await page.getByRole('button', { name: 'Entrar como pessoa de teste' }).click();
  await expect(page).toHaveURL(/\/user-portal$/);
  await failedAccess;
  await expect(page.getByTestId('card-equipe-1')).toBeVisible();
  await expect(page.getByTestId('link-manter-equipes')).toHaveCount(0);

  await page.goto('/manage');
  await expect(page).toHaveURL(/\/manage$/);
  await expect(page.getByTestId('state-sem-permissao-manage')).toContainText('Não foi possível conferir seu acesso.', { timeout: 15_000 });
  await expect(page.getByTestId('state-sem-permissao-manage')).toContainText('A manutenção não está disponível enquanto a permissão não puder ser verificada.');
  await expect(page.getByTestId('button-tentar-acesso')).toBeVisible();
  await expect(page.getByTestId('button-nova-equipe')).toHaveCount(0);
  await expect(page.getByTestId('button-selecionar-equipe-1')).toHaveCount(0);
  await expect(page.getByTestId('button-salvar-equipe')).toHaveCount(0);
  await expect(page.getByTestId('button-salvar-estudante-1')).toHaveCount(0);
  await expect(page.getByTestId('button-editar-estudante-1')).toHaveCount(0);
  expect(api.mutationRequests, 'a failed permission check must not change the roster').toEqual([]);
  expect(api.unexpectedRequests, 'all data must stay within the mocked API').toEqual([]);
});

test('test manager signs in, adds a student and sees the saved roster after reload', async ({ page }) => {
  const api = await mockRosterApi(page);

  await page.goto('/');
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar como pessoa de teste' }).click();
  await expect(page).toHaveURL(/\/user-portal$/);
  await page.getByTestId('link-manter-equipes').click();
  await expect(page).toHaveURL(/\/manage$/);

  await page.getByTestId('button-selecionar-equipe-1').click();
  await page.getByTestId('input-novo-estudante-1').fill('Marina Costa');
  await page.getByTestId('button-salvar-estudante-1').click();

  await expect(page.getByTestId('text-estudante-2')).toHaveText('Marina Costa');
  await expect(page.getByTestId('status-alteracao')).toContainText('Estudante adicionado à equipe.');
  expect(api.createdNames, 'create-student request body').toEqual(['Marina Costa']);

  await page.reload();
  await page.getByTestId('button-selecionar-equipe-1').click();
  await expect(page.getByTestId('text-estudante-2')).toHaveText('Marina Costa');
  expect(api.unexpectedRequests, 'all data must stay within the mocked API').toEqual([]);
});

test('administrator records a transversal session with another mentor', async ({ page }) => {
  const api = await mockRosterApi(page);

  await page.goto('/');
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar como pessoa de teste' }).click();
  await expect(page).toHaveURL(/\/user-portal$/);
  await page.getByTestId('link-manter-equipes').click();
  await expect(page).toHaveURL(/\/manage$/);
  await page.getByTestId('button-selecionar-equipe-1').click();

  await page.getByTestId('select-tipo-sessao-1').selectOption('transversal');
  await page.getByTestId('input-data-sessao-1').fill('2026-03-04');
  await page.getByTestId('select-mentor-sessao-1').selectOption('2');
  await page.getByTestId('select-teamNps-sessao-1').selectOption('9');
  await page.getByTestId('select-teamActionability-sessao-1').selectOption('8');
  await page.getByTestId('select-mentorCommitment-sessao-1').selectOption('7');
  await page.getByTestId('select-mentorTraction-sessao-1').selectOption('9');
  await page.getByTestId('textarea-teamFeedbackStrongPoints-1').fill('A equipe trouxe bons exemplos.');
  await page.getByTestId('textarea-teamFeedbackImprovements-1').fill('Definir métricas mais claras.');
  await page.getByTestId('textarea-agreedNextSteps-1').fill('Testar a hipótese nesta semana.');
  await page.getByTestId('textarea-mentorQualitativeAssessment-1').fill('A equipe demonstrou progresso.');
  await page.getByTestId('button-salvar-sessao-1').click();

  await expect(page.getByTestId('text-sessoes-1')).toContainText('1 sessão registrada');
  await expect(page.getByTestId('status-alteracao')).toContainText('Sessão registrada na equipe.');
  expect(api.sessionRequests).toEqual([{
    sessionType: 'transversal',
    sessionDate: '2026-03-04',
    mentorId: 2,
    teamNps: 9,
    teamActionability: 8,
    mentorCommitment: 7,
    mentorTraction: 9,
    teamFeedbackStrongPoints: 'A equipe trouxe bons exemplos.',
    teamFeedbackImprovements: 'Definir métricas mais claras.',
    agreedNextSteps: 'Testar a hipótese nesta semana.',
    mentorQualitativeAssessment: 'A equipe demonstrou progresso.',
  }]);

  await page.reload();
  await page.getByTestId('button-selecionar-equipe-1').click();
  await expect(page.getByTestId('text-sessoes-1')).toContainText('1 sessão registrada');
  expect(api.unexpectedRequests, 'all data must stay within the mocked API').toEqual([]);
});

test('conflicting student rename keeps the draft and offers to refresh the roster', async ({ page }) => {
  const api = await mockRosterApi(page);

  await page.goto('/');
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar como pessoa de teste' }).click();
  await expect(page).toHaveURL(/\/user-portal$/);
  await page.getByTestId('link-manter-equipes').click();
  await expect(page).toHaveURL(/\/manage$/);

  await page.getByTestId('button-selecionar-equipe-1').click();
  await page.getByTestId('button-editar-estudante-1').click();
  const draft = page.getByTestId('input-editar-estudante-1');
  await draft.fill('Ana Costa');
  api.changeStudentName('Ana Martins');
  await page.getByTestId('button-confirmar-edicao-estudante-1').click();

  await expect(page.getByTestId('erro-estudante-1')).toContainText('O estudante mudou em outra sessão.');
  await expect(page.getByTestId('erro-estudante-1-atualizar')).toBeVisible();
  await expect(draft).toHaveValue('Ana Costa');
  await expect(page.getByTestId('status-alteracao')).toHaveCount(0);
  expect(api.renameRequests, 'rename uses the outdated name seen by the administrator').toEqual([
    { name: 'Ana Costa', expectedName: 'Ana Lima' },
  ]);

  await page.getByTestId('erro-estudante-1-atualizar').click();
  await expect(page.getByTestId('status-nome-alterado-estudante-1')).toContainText('Ana Martins');
  await expect(draft).toHaveValue('Ana Costa');
  await expect(page.getByTestId('status-alteracao')).toHaveCount(0);
  expect(api.unexpectedRequests, 'all data must stay within the mocked API').toEqual([]);
});