import { expect, test } from '@playwright/test';
import type { DashboardStats, MentorOption, Team } from '@workspace/api-client-react';

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
  const unexpectedRequests: string[] = [];

  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
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
      if (!retryAllowed) {
        status = 503;
        data = { error: 'History temporarily unavailable' };
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

  await expect(alert).toContainText('Não foi possível consultar o histórico.', { timeout: 45_000 });
  await expect(retry).toBeVisible();
  expect(historyRequests, 'the failed query should exhaust its automatic attempts').toBeGreaterThanOrEqual(4);

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await retry.scrollIntoViewIfNeeded();

    const layout = await alert.evaluate((element) => {
      const alertRect = element.getBoundingClientRect();
      const messageRange = document.createRange();
      messageRange.selectNodeContents(element.firstChild ?? element);
      const messageLines = Array.from(messageRange.getClientRects()).map((rect) => ({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
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

  retryAllowed = true;
  const retryResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/roster-audit' && response.status() === 200,
  );
  await retry.click();
  await retryResponse;
  await expect(history.getByTestId('historico-vazio')).toBeVisible();
  expect(historyRequests, 'retry should issue another history request').toBeGreaterThanOrEqual(5);
  expect(unexpectedRequests, 'the flow should use only the mocked API').toEqual([]);
});