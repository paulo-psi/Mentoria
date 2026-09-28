import { expect, test, type Page } from '@playwright/test';
import type { Student, Team } from '@workspace/api-client-react';

async function mockRosterApi(page: Page) {
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
  const unexpectedRequests: string[] = [];

  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    let data: unknown;
    let status = 200;

    if (method === 'GET' && pathname === '/api/access') data = { canManage: true };
    else if (method === 'GET' && pathname === '/api/healthz') data = { status: 'ok' };
    else if (method === 'GET' && pathname === '/api/health') data = { status: 'ok', database: 'connected' };
    else if (method === 'GET' && pathname === '/api/teams') data = [team];
    else if (method === 'GET' && pathname === '/api/mentors') data = [{ id: 1, name: 'Mentora de Teste' }];
    else if (method === 'GET' && pathname === '/api/roster-audit') data = [];
    else if (method === 'POST' && pathname === '/api/teams/1/students') {
      const body = route.request().postDataJSON() as { name: string };
      createdNames.push(body.name);
      const student: Student = { id: 2, name: body.name, sortOrder: team.students.length };
      team.students.push(student);
      status = 201;
      data = student;
    } else {
      unexpectedRequests.push(`${method} ${pathname}`);
      status = 501;
      data = { error: `Unexpected browser-test request: ${method} ${pathname}` };
    }

    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });

  return { createdNames, unexpectedRequests };
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