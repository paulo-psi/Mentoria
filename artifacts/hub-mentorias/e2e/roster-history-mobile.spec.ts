import { expect, test, type Page } from '@playwright/test';
import type { DashboardStats, MentorOption, Team } from '@workspace/api-client-react';

async function assertHistoryErrorFitsAtMobileWidths(page: Page, expectedTeamId?: string) {
  const history = page.getByTestId('historico-relacao');
  const alert = history.getByRole('alert');
  const retry = alert.getByRole('button', { name: 'Tentar novamente' });

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(alert).toBeVisible();
    await expect(retry).toBeVisible();
    if (expectedTeamId !== undefined) {
      await expect(history.getByTestId('filtro-historico-equipe')).toHaveValue(expectedTeamId);
      await expect(history.getByTestId('filtro-historico-estudante')).toHaveValue('');
    }
    await retry.scrollIntoViewIfNeeded();

    const layout = await alert.evaluate((element) => {
      const alertRect = element.getBoundingClientRect();
      const messageRange = document.createRange();
      messageRange.selectNodeContents(element.firstChild ?? element);
      const messageLines = Array.from(messageRange.getClientRects()).map((rect) => ({
        left: rect.left,
        right: rect.right,
      }));
      const button = element.querySelector('button');
      const buttonRect = button?.getBoundingClientRect();
      return {
        alert: {
          left: alertRect.left,
          right: alertRect.right,
          top: alertRect.top,
          bottom: alertRect.bottom,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        },
        messageLines,
        button: buttonRect ? {
          left: buttonRect.left,
          right: buttonRect.right,
          top: buttonRect.top,
          bottom: buttonRect.bottom,
          height: buttonRect.height,
        } : null,
      };
    });

    expect(layout.alert.left).toBeGreaterThanOrEqual(0);
    expect(layout.alert.right).toBeLessThanOrEqual(width);
    expect(layout.alert.top).toBeGreaterThanOrEqual(0);
    expect(layout.alert.bottom).toBeLessThanOrEqual(844);
    expect(layout.alert.scrollWidth).toBeLessThanOrEqual(layout.alert.clientWidth);
    expect(layout.alert.scrollHeight).toBeLessThanOrEqual(layout.alert.clientHeight);
    expect(layout.messageLines.length, 'the full error message should be laid out').toBeGreaterThan(0);
    for (const line of layout.messageLines) {
      expect(line.left).toBeGreaterThanOrEqual(layout.alert.left - 1);
      expect(line.right).toBeLessThanOrEqual(layout.alert.right + 1);
    }
    expect(layout.button, 'retry button should remain present').not.toBeNull();
    expect(layout.button!.left).toBeGreaterThanOrEqual(0);
    expect(layout.button!.right).toBeLessThanOrEqual(width);
    expect(layout.button!.top).toBeGreaterThanOrEqual(0);
    expect(layout.button!.bottom).toBeLessThanOrEqual(844);
    expect(layout.button!.height).toBeGreaterThanOrEqual(40);
  }
}

test('mobile roster history error stays readable and retry recovers', async ({ page }) => {
  test.setTimeout(90_000);

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
    students: [],
    sessionCount: 0,
    totalSessions: 0,
    transversalSessionCount: 0,
    lastSessionDate: null,
    lastSessionScore: null,
    latestAgreedNextSteps: null,
  };
  const mentors: MentorOption[] = [{
    id: 1,
    name: 'Mentora de Teste',
    email: null,
    expertiseArea: null,
    mentorType: null,
    totalSessions: 0,
    avgNpsReceived: null,
    assignedTeamsCount: 1,
  }];
  const dashboardStats: DashboardStats = {
    totalSessions: 18,
    avgNps: 8.6,
    avgTraction: 8.5,
    networkOpennessRate: 41.7,
  };

  let historyRequests = 0;
  let retryAllowed = false;
  let holdInitialHistoryResponse = true;
  let signalInitialHistoryRequestStarted!: () => void;
  let releaseInitialHistoryResponse!: () => void;
  const initialHistoryRequestStarted = new Promise<void>((resolve) => {
    signalInitialHistoryRequestStarted = resolve;
  });
  const initialHistoryRequestCanFinish = new Promise<void>((resolve) => {
    releaseInitialHistoryResponse = resolve;
  });
  let teamHistoryResponse: unknown = [];
  let holdInitialFilteredResponse = false;
  let signalInitialFilteredRequestStarted!: () => void;
  let releaseInitialFilteredResponse!: () => void;
  const initialFilteredRequestStarted = new Promise<void>((resolve) => {
    signalInitialFilteredRequestStarted = resolve;
  });
  const initialFilteredRequestCanFinish = new Promise<void>((resolve) => {
    releaseInitialFilteredResponse = resolve;
  });
  let holdFilteredRetryResponse = false;
  let signalFilteredRetryStarted!: () => void;
  let releaseFilteredRetryResponse!: () => void;
  const filteredRetryStarted = new Promise<void>((resolve) => {
    signalFilteredRetryStarted = resolve;
  });
  const filteredRetryCanFinish = new Promise<void>((resolve) => {
    releaseFilteredRetryResponse = resolve;
  });
  const historyFilters: Array<{ teamId: string | null; studentId: string | null }> = [];
  const unexpectedRequests: string[] = [];

  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const { pathname } = requestUrl;
    const method = route.request().method();
    let status = 200;
    let data: unknown;

    if (method === 'GET' && pathname === '/api/access') data = { canManage: true };
    else if (method === 'GET' && pathname === '/api/healthz') data = { status: 'ok' };
    else if (method === 'GET' && pathname === '/api/health') data = { status: 'ok', database: 'connected' };
    else if (method === 'GET' && pathname === '/api/dashboard/stats') data = dashboardStats;
    else if (method === 'GET' && pathname === '/api/teams') data = [team];
    else if (method === 'GET' && pathname === '/api/mentors') data = mentors;
    else if (method === 'GET' && pathname === '/api/teams/1/sessions') data = [];
    else if (method === 'GET' && pathname === '/api/roster-audit') {
      historyRequests += 1;
      const teamId = requestUrl.searchParams.get('teamId');
      const studentId = requestUrl.searchParams.get('studentId');
      historyFilters.push({ teamId, studentId });
      if (teamId === null && studentId === null && holdInitialHistoryResponse) {
        signalInitialHistoryRequestStarted();
        await initialHistoryRequestCanFinish;
      }
      if (!retryAllowed) {
        status = 503;
        data = { error: 'History temporarily unavailable' };
      } else if (teamId === '4' && studentId === null) {
        data = [{
          id: 4,
          teamId: 4,
          studentId: null,
          summary: 'Equipe Ipê atualizada',
          createdAt: '2026-03-06T12:00:00.000Z',
          actorEmail: 'admin@example.com',
        }];
      } else if (teamId === '2' && studentId === null) {
        if (holdInitialFilteredResponse) {
          signalInitialFilteredRequestStarted();
          await initialFilteredRequestCanFinish;
        }
        if (holdFilteredRetryResponse) {
          signalFilteredRetryStarted();
          await filteredRetryCanFinish;
        }
        data = teamHistoryResponse;
      } else if (teamId === null && studentId === null) {
        data = [{
          id: 1,
          teamId: 1,
          studentId: null,
          summary: 'Equipe Horizonte criada',
          createdAt: '2026-03-04T12:00:00.000Z',
          actorEmail: 'admin@example.com',
        }];
      } else {
        data = [];
      }
    } else {
      unexpectedRequests.push(`${method} ${pathname}`);
      status = 501;
      data = { error: `Unexpected browser-test request: ${method} ${pathname}` };
    }

    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });

  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar como pessoa de teste' }).click();
  await expect(page).toHaveURL(/\/user-portal$/);
  await page.goto('/manage');

  const history = page.getByTestId('historico-relacao');
  const alert = history.getByRole('alert');
  const retry = alert.getByRole('button', { name: 'Tentar novamente' });
  const historyAnnouncement = history.getByTestId('historico-announcement');

  await initialHistoryRequestStarted;
  await expect(history.getByRole('status')).toHaveText('Carregando histórico…');
  await expect(historyAnnouncement).toHaveText('');
  holdInitialHistoryResponse = false;
  releaseInitialHistoryResponse();
  await expect(alert).toContainText('Não foi possível consultar o histórico.', { timeout: 45_000 });
  await expect(retry).toBeVisible();
  await expect(historyAnnouncement).toHaveText('');
  expect(historyRequests, 'the failed query should exhaust its automatic attempts').toBeGreaterThanOrEqual(4);
  await assertHistoryErrorFitsAtMobileWidths(page);

  retryAllowed = true;
  const retryResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/roster-audit' && response.status() === 200,
  );
  await retry.click();
  await retryResponse;
  const historyList = history.getByTestId('lista-historico');
  await expect(historyList).toBeVisible();
  await expect(historyList).toContainText('Equipe Horizonte criada');
  await expect(historyAnnouncement).toHaveText(
    'Consulta de histórico concluída (sem filtros): 1 registro encontrado.',
  );
  expect(historyRequests, 'retry should issue another history request').toBeGreaterThanOrEqual(5);

  retryAllowed = false;
  await history.getByRole('button', { name: 'Atualizar histórico' }).click();
  await expect(alert).toContainText('Não foi possível atualizar o histórico.', { timeout: 45_000 });
  await expect(alert).toContainText('sem filtros');
  await expect(historyList).toContainText('Equipe Horizonte criada');
  await assertHistoryErrorFitsAtMobileWidths(page);

  retryAllowed = true;
  const refreshRetryResponse = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === '/api/roster-audit' &&
      requestUrl.searchParams.size === 0 &&
      response.status() === 200;
  });
  await retry.click();
  await refreshRetryResponse;
  await expect(historyList).toContainText('Equipe Horizonte criada');

  const teamFilter = history.getByTestId('filtro-historico-equipe');
  retryAllowed = true;
  teamHistoryResponse = [{
    id: 2,
    teamId: 2,
    studentId: null,
    summary: 'Equipe Aurora registrada',
    createdAt: '2026-03-05T12:00:00.000Z',
    actorEmail: 'admin@example.com',
  }];
  const initialFilteredResponse = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === '/api/roster-audit' &&
      requestUrl.searchParams.get('teamId') === '2' &&
      response.status() === 200;
  });
  holdInitialFilteredResponse = true;
  await teamFilter.fill('2');
  await initialFilteredRequestStarted;
  const historyUpdateStatus = history.getByRole('status');
  await expect(historyUpdateStatus).toHaveText(
    'Atualizando histórico. Os resultados da última consulta (sem filtros) continuam visíveis.',
  );
  await expect(historyList).toContainText('Equipe Horizonte criada');
  await expect(historyList).not.toContainText('Equipe Aurora registrada');
  await expect(historyAnnouncement).toHaveText('');
  holdInitialFilteredResponse = false;
  releaseInitialFilteredResponse();
  await initialFilteredResponse;
  await expect(historyUpdateStatus).toHaveCount(0);
  await expect(historyList).toContainText('Equipe Aurora registrada');
  await expect(historyAnnouncement).toHaveText(
    'Consulta de histórico concluída (equipe #2): 1 registro encontrado.',
  );

  retryAllowed = false;
  await history.getByRole('button', { name: 'Atualizar histórico' }).click();
  await expect(alert).toContainText('Não foi possível atualizar o histórico.', { timeout: 45_000 });
  await expect(alert).toContainText('equipe #2');
  await expect(historyAnnouncement).toHaveText('');
  await expect(historyList).toContainText('Equipe Aurora registrada');
  await expect(historyList).not.toContainText('Equipe Horizonte criada');
  await expect(teamFilter).toHaveValue('2');
  await expect(history.getByTestId('filtro-historico-estudante')).toHaveValue('');
  const failedTeamRequests = historyFilters.filter((filter) => filter.teamId === '2');
  expect(failedTeamRequests.length, 'the filtered query should succeed before its update fails').toBeGreaterThanOrEqual(5);
  expect(failedTeamRequests.every((filter) => filter.studentId === null)).toBe(true);
  await assertHistoryErrorFitsAtMobileWidths(page, '2');

  retryAllowed = true;
  teamHistoryResponse = [{
    id: 3,
    teamId: 2,
    studentId: null,
    summary: 'Equipe Aurora atualizada',
    createdAt: '2026-03-06T12:00:00.000Z',
    actorEmail: 'admin@example.com',
  }];
  holdFilteredRetryResponse = true;
  const filteredRetryResponse = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === '/api/roster-audit' &&
      requestUrl.searchParams.get('teamId') === '2' &&
      response.status() === 200;
  });
  await retry.click();
  await filteredRetryStarted;
  await expect(alert).toContainText('Não foi possível atualizar o histórico.');
  await expect(historyAnnouncement).toHaveText('');
  await expect(historyList).toContainText('Equipe Aurora registrada');
  await expect(historyList).not.toContainText('Equipe Aurora atualizada');
  releaseFilteredRetryResponse();
  await filteredRetryResponse;
  await expect(historyUpdateStatus).toHaveCount(0);
  await expect(historyList).toBeVisible();
  await expect(historyList).toContainText('Equipe Aurora atualizada');
  await expect(historyAnnouncement).toHaveText(
    'Consulta de histórico concluída (equipe #2): 1 registro encontrado.',
  );
  await expect(historyList).toContainText('Equipe #2');
  await expect(historyList).not.toContainText('Equipe Aurora registrada');
  await expect(historyList).not.toContainText('Equipe Horizonte criada');
  await expect(historyList.locator('li')).toHaveCount(1);
  expect(historyFilters.at(-1)).toEqual({ teamId: '2', studentId: null });
  await expect(teamFilter).toHaveValue('2');
  expect(unexpectedRequests, 'the flow should use only the mocked API').toEqual([]);

  retryAllowed = true;
  const emptyResponse = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === '/api/roster-audit' &&
      requestUrl.searchParams.get('teamId') === '3' &&
      response.status() === 200;
  });
  await teamFilter.fill('3');
  await emptyResponse;
  const emptyHistory = history.getByTestId('historico-vazio');
  await expect(emptyHistory).toHaveText('Nenhuma alteração registrada para este filtro.');

  retryAllowed = false;
  await teamFilter.fill('4');
  await expect(alert).toContainText('Não foi possível atualizar o histórico.', { timeout: 45_000 });
  await expect(alert).toContainText('equipe #3');
  await expect(emptyHistory).toHaveText('Nenhuma alteração registrada na última consulta (equipe #3).');
  await expect(teamFilter).toHaveValue('4');

  retryAllowed = true;
  const emptyStateRetryResponse = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === '/api/roster-audit' &&
      requestUrl.searchParams.get('teamId') === '4' &&
      response.status() === 200;
  });
  await retry.click();
  await emptyStateRetryResponse;
  await expect(history.getByTestId('lista-historico')).toContainText('Equipe Ipê atualizada');
  await expect(history.getByTestId('historico-vazio')).toHaveCount(0);
  expect(historyFilters.at(-1)).toEqual({ teamId: '4', studentId: null });

  const emptyBaselineResponse = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === '/api/roster-audit' &&
      requestUrl.searchParams.get('teamId') === '5' &&
      response.status() === 200;
  });
  await teamFilter.fill('5');
  await emptyBaselineResponse;
  await expect(history.getByTestId('historico-vazio')).toHaveText('Nenhuma alteração registrada para este filtro.');
  await expect(historyAnnouncement).toHaveText(
    'Consulta de histórico concluída (equipe #5): 0 registros encontrados.',
  );

  retryAllowed = false;
  await teamFilter.fill('6');
  await expect(alert).toContainText('Não foi possível atualizar o histórico.', { timeout: 45_000 });
  await expect(alert).toContainText('equipe #5');
  await expect(historyAnnouncement).toHaveText('');
  await expect(history.getByTestId('historico-vazio'))
    .toHaveText('Nenhuma alteração registrada na última consulta (equipe #5).');
  await expect(teamFilter).toHaveValue('6');

  retryAllowed = true;
  const emptyRetryResponse = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === '/api/roster-audit' &&
      requestUrl.searchParams.get('teamId') === '6' &&
      response.status() === 200;
  });
  await retry.click();
  await emptyRetryResponse;
  await expect(alert).toHaveCount(0);
  await expect(historyAnnouncement).toHaveText(
    'Consulta de histórico concluída (equipe #6): 0 registros encontrados.',
  );
  await expect(history.getByTestId('historico-vazio'))
    .toHaveText('Nenhuma alteração registrada para este filtro.');
  await expect(history.getByTestId('historico-vazio')).not.toContainText('equipe #5');
  await expect(history.getByTestId('historico-vazio')).not.toContainText('equipe #6');
  await expect(history.getByTestId('lista-historico')).toHaveCount(0);
  await expect(teamFilter).toHaveValue('6');
  expect(historyFilters.at(-1)).toEqual({ teamId: '6', studentId: null });
});