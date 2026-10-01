import { devices, expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import type { DashboardStats, MentorOption, Student, Team } from '@workspace/api-client-react';

async function createTouchPage(browser: Browser) {
  const baseURL = test.info().project.use.baseURL;
  if (typeof baseURL !== 'string') throw new Error('The Playwright project must define a baseURL.');
  const context = await browser.newContext({ ...devices['iPhone 13'], baseURL });
  return { context, page: await context.newPage() };
}

async function mockRosterApi(
  page: Page,
  canManage = true,
  { accessFails = false, teamsFail = false }: { accessFails?: boolean; teamsFail?: boolean } = {},
) {
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
    totalSessions: 0,
    transversalSessionCount: 0,
    lastSessionDate: null,
    lastSessionScore: null,
    latestAgreedNextSteps: null,
  };
  const createdNames: string[] = [];
  const createdMentors: Array<{
    name: string;
    email: string | null;
    expertiseArea: string | null;
    mentorType: 'interno' | 'externo' | null;
  }> = [];
  const sessionRequests: Array<Record<string, unknown>> = [];
  const renameRequests: Array<{ name: string; expectedName: string }> = [];
  const mutationRequests: string[] = [];
  const unexpectedRequests: string[] = [];
  const dashboardStats: DashboardStats = {
    totalSessions: 18,
    avgNps: 8.6,
    avgTraction: 8.5,
    networkOpennessRate: 41.7,
  };
  const mentors: MentorOption[] = [
    {
      id: 1,
      name: 'Mentora de Teste',
      email: null,
      expertiseArea: null,
      mentorType: null,
      totalSessions: 0,
      avgNpsReceived: null,
      assignedTeamsCount: 1,
    },
    {
      id: 2,
      name: 'Mentor Transversal',
      email: null,
      expertiseArea: null,
      mentorType: 'externo',
      totalSessions: 0,
      avgNpsReceived: null,
      assignedTeamsCount: 0,
    },
  ];

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
    else if (method === 'GET' && pathname === '/api/dashboard/stats') data = dashboardStats;
    else if (method === 'GET' && pathname === '/api/teams') {
      if (teamsFail) {
        status = 503;
        data = { error: 'Roster read unavailable' };
      } else {
        data = [team];
      }
    }
    else if (method === 'GET' && pathname === '/api/mentors') data = mentors;
    else if (canManage && method === 'POST' && pathname === '/api/mentors') {
      const body = route.request().postDataJSON() as {
        name: string;
        email: string | null;
        expertiseArea: string | null;
        mentorType: 'interno' | 'externo' | null;
      };
      createdMentors.push(body);
      const mentor: MentorOption = {
        id: 3,
        ...body,
        totalSessions: 0,
        avgNpsReceived: null,
        assignedTeamsCount: 0,
      };
      mentors.push(mentor);
      status = 201;
      data = mentor;
    }
    else if (method === 'GET' && pathname === '/api/teams/1/sessions') data = [];
    else if (method === 'GET' && pathname === '/api/roster-audit') {
      const mentorId = new URL(route.request().url()).searchParams.get('mentorId');
      data = mentorId === '3' ? [{
        id: 3,
        teamId: null,
        studentId: null,
        mentorId: 3,
        action: 'mentor.created',
        actorEmail: 'admin@example.com',
        summary: 'Mentor cadastrado: Mentora de Empreendedorismo.',
        createdAt: '2026-03-08T12:00:00.000Z',
      }] : [];
    }
    else if (canManage && method === 'POST' && pathname === '/api/teams/1/sessions') {
      const body = route.request().postDataJSON() as {
        sessionDate: string;
        sessionType: string;
        teamNps: number;
        agreedNextSteps: string;
        [key: string]: unknown;
      };
      sessionRequests.push(body);
      team.sessionCount += 1;
      team.totalSessions += 1;
      if (body.sessionType === 'transversal' || body.sessionType === 'externo') {
        team.transversalSessionCount += 1;
      }
      team.lastSessionDate = body.sessionDate;
      team.lastSessionScore = body.teamNps;
      team.latestAgreedNextSteps = body.agreedNextSteps;
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
    createdMentors,
    sessionRequests,
    renameRequests,
    mutationRequests,
    unexpectedRequests,
    changeStudentName: (name: string) => { team.students[0] = { ...team.students[0], name }; },
  };
}

const mobileWidths = [320, 360, 390, 430];

async function assertMobileNoticeFits(page: Page, notice: Locator, retryButton?: Locator) {
  await expect(notice).toBeVisible();
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);

  const layout = await notice.evaluate((element) => {
    const viewportWidth = document.documentElement.clientWidth;
    const rect = element.getBoundingClientRect();
    const textFits = Array.from(element.querySelectorAll<HTMLElement>('h2, h3, p'))
      .every((text) => {
        const textRect = text.getBoundingClientRect();
        return textRect.left >= 0 &&
          textRect.right <= viewportWidth &&
          text.scrollWidth <= text.clientWidth;
      });
    const button = element.querySelector('button');
    const buttonRect = button?.getBoundingClientRect();
    return {
      sectionFits: rect.left >= 0 && rect.right <= viewportWidth,
      textFits,
      buttonFits: !buttonRect || (
        buttonRect.left >= 0 &&
        buttonRect.right <= viewportWidth &&
        buttonRect.height >= 40
      ),
    };
  });

  expect(layout.sectionFits, 'maintenance notice should fit within the mobile viewport').toBe(true);
  expect(layout.textFits, 'maintenance notice text should not be clipped or overflow').toBe(true);
  expect(layout.buttonFits, 'retry action should fit and meet the 40px touch target').toBe(true);
  if (retryButton) await expect(retryButton).toBeVisible();
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
  await expect(page.getByTestId('table-executive-teams')).toBeVisible();
  await expect(page.getByTestId('row-equipe-1')).toBeVisible();
  await expect(page.getByTestId('text-equipe-1')).toHaveText('Equipe Horizonte');
  await expect(page.getByTestId('link-manter-equipes')).toHaveCount(0);

  await page.goto('/manage');
  await expect(page).toHaveURL(/\/manage$/);
  const restrictedNotice = page.getByTestId('state-sem-permissao-manage');
  for (const width of mobileWidths) {
    await page.setViewportSize({ width, height: 844 });
    await expect(restrictedNotice).toContainText('Manutenção restrita');
    await assertMobileNoticeFits(page, restrictedNotice);
    await expect(page.getByTestId('button-nova-equipe')).toHaveCount(0);
    await expect(page.getByTestId('button-selecionar-equipe-1')).toHaveCount(0);
    await expect(page.getByTestId('button-salvar-equipe')).toHaveCount(0);
    await expect(page.getByTestId('button-salvar-sessao-1')).toHaveCount(0);
  }
  expect(api.mutationRequests, 'view-only navigation must not change the roster').toEqual([]);
  expect(api.unexpectedRequests, 'all data must stay within the mocked API').toEqual([]);
});

test('failed permission check stays readable and retryable at mobile widths', async ({ browser }) => {
  const { context, page } = await createTouchPage(browser);
  const api = await mockRosterApi(page, true, { accessFails: true });

  await page.goto('/');
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  const failedAccess = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/access' && response.status() === 503,
  );
  await page.getByRole('button', { name: 'Entrar como pessoa de teste' }).click();
  await expect(page).toHaveURL(/\/user-portal$/);
  await failedAccess;
  await expect(page.getByTestId('row-equipe-1')).toBeVisible();
  await expect(page.getByTestId('link-manter-equipes')).toHaveCount(0);

  await page.goto('/manage');
  await expect(page).toHaveURL(/\/manage$/);
  const permissionNotice = page.getByTestId('state-sem-permissao-manage');
  const retryAccess = page.getByTestId('button-tentar-acesso');
  for (const width of mobileWidths) {
    await page.setViewportSize({ width, height: 844 });
    await expect(permissionNotice).toContainText('Não foi possível conferir seu acesso.', { timeout: 15_000 });
    await expect(permissionNotice).toContainText('A manutenção não está disponível enquanto a permissão não puder ser verificada.');
    await assertMobileNoticeFits(page, permissionNotice, retryAccess);
    await expect(page.getByTestId('button-nova-equipe')).toHaveCount(0);
    await expect(page.getByTestId('button-selecionar-equipe-1')).toHaveCount(0);
    await expect(page.getByTestId('button-salvar-equipe')).toHaveCount(0);
    await expect(page.getByTestId('button-salvar-estudante-1')).toHaveCount(0);
    await expect(page.getByTestId('button-editar-estudante-1')).toHaveCount(0);

  }
  await page.setViewportSize({ width: 320, height: 844 });
  const accessRetryResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/access' && response.status() === 503,
  );
  await retryAccess.tap();
  await accessRetryResponse;
  await context.close();
  expect(api.mutationRequests, 'a failed permission check must not change the roster').toEqual([]);
  expect(api.unexpectedRequests, 'all data must stay within the mocked API').toEqual([]);
});

test('failed team read stays readable and retryable at mobile widths', async ({ browser }) => {
  const { context, page } = await createTouchPage(browser);
  const api = await mockRosterApi(page, true, { teamsFail: true });

  await page.goto('/');
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar como pessoa de teste' }).click();
  await expect(page).toHaveURL(/\/user-portal$/);
  await page.goto('/manage');

  const readFailure = page.getByTestId('state-erro-manage');
  const retryRead = page.getByTestId('button-atualizar-manage');
  for (const width of mobileWidths) {
    await page.setViewportSize({ width, height: 844 });
    await expect(readFailure).toContainText('A relação não carregou.', { timeout: 15_000 });
    await expect(readFailure).toContainText('Não é seguro editar sem os dados atuais. Tente atualizar a leitura.');
    await assertMobileNoticeFits(page, readFailure, retryRead);

  }
  await page.setViewportSize({ width: 320, height: 844 });
  const readRetryResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/teams' && response.status() === 503,
  );
  await retryRead.tap();
  await readRetryResponse;

  await context.close();
  expect(api.mutationRequests, 'failed read retries must not change the roster').toEqual([]);
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

test('administrator registers a mentor and sees it in the roster after reload', async ({ page }) => {
  const api = await mockRosterApi(page);

  await page.goto('/');
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar como pessoa de teste' }).click();
  await expect(page).toHaveURL(/\/user-portal$/);
  await page.getByTestId('link-manter-equipes').click();
  await expect(page).toHaveURL(/\/manage$/);

  await page.getByTestId('button-novo-mentor').click();
  await page.getByTestId('input-nome-mentor').fill('Mentora de Empreendedorismo');
  await page.getByTestId('input-email-mentor').fill('mentora@example.org');
  await page.getByTestId('input-especialidade-mentor').fill('Inovação');
  await page.getByTestId('select-tipo-mentor').selectOption('externo');
  await page.getByTestId('button-salvar-mentor').click();

  await expect(page.getByTestId('status-alteracao')).toContainText('Mentor cadastrado');
  expect(api.createdMentors).toEqual([{
    name: 'Mentora de Empreendedorismo',
    email: 'mentora@example.org',
    expertiseArea: 'Inovação',
    mentorType: 'externo',
  }]);

  const mentorHistoryResponse = page.waitForResponse((response) => {
    const requestUrl = new URL(response.url());
    return requestUrl.pathname === '/api/roster-audit' &&
      requestUrl.searchParams.get('mentorId') === '3' &&
      response.status() === 200;
  });
  await page.getByTestId('filtro-historico-mentor').fill('3');
  await mentorHistoryResponse;
  await expect(page.getByTestId('lista-historico')).toContainText('Mentor cadastrado: Mentora de Empreendedorismo.');
  await expect(page.getByTestId('lista-historico')).toContainText('Mentor #3');

  await page.reload();
  await expect(page.getByTestId('text-contagem-cadastro')).toContainText('3 mentores');
  expect(api.unexpectedRequests).toEqual([]);
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

test('mobile tables, registration dialog, and dossier stay within the viewport', async ({ page }) => {
  const api = await mockRosterApi(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar como pessoa de teste' }).click();
  await expect(page).toHaveURL(/\/user-portal$/);

  const assertPageFits = async () => {
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);
  };
  const assertTableCanScrollHorizontally = async (
    testId: string,
    tableLabel: string,
    rowTestId: string,
    identity: string,
  ) => {
    const card = page.getByTestId(testId);
    const region = card.getByTestId(`${testId}-scroll-region`);
    const hint = card.getByTestId(`${testId}-scroll-hint`);
    const table = card.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader').first()).toHaveAttribute('scope', 'col');
    await expect(region).toHaveAttribute('role', 'region');
    await expect(region).toHaveAttribute('aria-label', tableLabel);
    await expect(region).toHaveAttribute('tabindex', '0');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Deslize para ver mais colunas');
    await expect(region).toHaveAttribute('aria-describedby', await hint.getAttribute('id') ?? '');

    const canScroll = await region.evaluate((scroller) =>
      getComputedStyle(scroller).overflowX === 'auto' &&
      scroller.scrollWidth > scroller.clientWidth,
    );
    expect(canScroll, `${testId} should scroll inside its own region`).toBe(true);
    await expect(region).toHaveCSS('touch-action', 'pan-x');

    const row = card.getByTestId(rowTestId);
    const identityName = row.locator('td:first-child p').first();
    await expect(identityName).toHaveText(identity);
    const identityFits = await identityName.evaluate((element) => {
      const styles = getComputedStyle(element);
      return styles.whiteSpace === 'normal' &&
        styles.textOverflow !== 'ellipsis' &&
        element.scrollWidth <= element.clientWidth + 1;
    });
    expect(identityFits, `${testId} should not truncate row identity`).toBe(true);
    await region.evaluate((scroller) => {
      scroller.scrollLeft = scroller.scrollWidth;
    });
    const stickyIdentityOffset = await region.evaluate((scroller, rowId) => {
      const firstCell = document.querySelector<HTMLElement>(`[data-testid="${rowId}"] td:first-child`);
      return firstCell
        ? firstCell.getBoundingClientRect().left - scroller.getBoundingClientRect().left
        : Number.POSITIVE_INFINITY;
    }, rowTestId);
    expect(stickyIdentityOffset, `${testId} should keep its first column visible`).toBeGreaterThanOrEqual(0);
    expect(stickyIdentityOffset, `${testId} should pin its first column to the scroll region`).toBeLessThanOrEqual(2);
    await expect(row.locator('td').first()).toContainText(identity);

    await region.evaluate((scroller) => {
      scroller.scrollLeft = 0;
    });

    await region.focus();
    await region.press('ArrowRight');
    await expect.poll(() => region.evaluate((scroller) => scroller.scrollLeft)).toBeGreaterThan(0);
    await region.press('ArrowLeft');
    await expect.poll(() => region.evaluate((scroller) => scroller.scrollLeft)).toBe(0);
  };
  const assertOverlayFits = async (testId: string) => {
    const overlay = page.getByTestId(testId);
    await expect.poll(async () => {
      const viewport = page.viewportSize();
      if (!viewport) return false;
      return overlay.evaluate((element, size) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 &&
          rect.top >= 0 &&
          rect.right <= size.width &&
          rect.bottom <= size.height;
      }, viewport);
    }).toBe(true);
  };

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await assertPageFits();
    await assertTableCanScrollHorizontally(
      'table-executive-teams',
      'Tabela de equipes',
      'row-equipe-1',
      'Equipe Horizonte',
    );
    await assertPageFits();

    await page.getByTestId('button-ver-dossie-1').click();
    const dossier = page.getByTestId('drawer-dossie-equipe');
    await expect(dossier).toBeVisible();
    await assertOverlayFits('drawer-dossie-equipe');
    await assertPageFits();
    await page.getByTestId('button-fechar-dossie').click();
    await expect(dossier).toBeHidden();

    await page.getByRole('tab', { name: /Mentores/ }).click();
    await expect(page.getByTestId('table-mentores')).toBeVisible();
    await assertTableCanScrollHorizontally(
      'table-mentores',
      'Tabela de mentores',
      'row-mentor-1',
      'Mentora de Teste',
    );
    await assertPageFits();

    await page.getByRole('tab', { name: /Equipes/ }).click();
    await page.getByTestId('button-novo-registro').click();
    const registration = page.getByTestId('modal-novo-registro');
    await expect(registration).toBeVisible();
    await assertOverlayFits('modal-novo-registro');
    await assertPageFits();

    const fieldHeader = page.getByTestId('field-header-teamFeedbackImprovements-registro');
    const label = await fieldHeader.locator('label').boundingBox();
    const counter = await fieldHeader.locator('span').boundingBox();
    expect(label).not.toBeNull();
    expect(counter).not.toBeNull();
    const separated = label!.right <= counter!.x ||
      counter!.right <= label!.x ||
      label!.y + label!.height <= counter!.y ||
      counter!.y + counter!.height <= label!.y;
    expect(separated, 'field label and character count should not overlap').toBe(true);

    await page.keyboard.press('Escape');
    await expect(registration).toBeHidden();
  }

  expect(api.unexpectedRequests, 'mobile interactions should use only the mocked API').toEqual([]);
});

test('mobile maintenance forms fit and remain usable at narrow widths', async ({ page }) => {
  const api = await mockRosterApi(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Entrar como pessoa de teste' }).click();
  await expect(page).toHaveURL(/\/user-portal$/);
  await expect(page.getByTestId('text-app-brand')).toHaveText('HUB de Mentorias PIBEP PUCPR');
  await page.goto('/manage');
  await expect(page.getByTestId('button-nova-equipe')).toBeVisible();
  await expect(page.getByTestId('badge-admin-context')).toHaveText('Área administrativa');

  const assertPageFits = async () => {
    await expect.poll(() => page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    )).toBe(true);
  };
  await assertPageFits();
  const assertControlsFit = async (scope: Locator) => {
    await expect.poll(() => scope.evaluate((element) => {
      const viewportWidth = document.documentElement.clientWidth;
      return Array.from(element.querySelectorAll<HTMLElement>('input, select, textarea, button'))
        .filter((control) => control.getClientRects().length > 0)
        .flatMap((control) => {
          const rect = control.getBoundingClientRect();
          const problems: string[] = [];
          if (rect.left < 0 || rect.right > viewportWidth) problems.push(`${control.tagName} outside viewport`);
          if (control.tagName === 'BUTTON' && rect.height < 40) {
            const label = control.dataset.testid ?? control.textContent?.trim() ?? 'unlabeled button';
            problems.push(`${label} is only ${Math.round(rect.height)}px tall`);
          }
          return problems;
        });
    })).toEqual([]);
  };

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await assertControlsFit(page.locator('main'));
    await assertPageFits();

    await page.getByTestId('button-selecionar-equipe-1').click();
    await expect(page.getByTestId('panel-equipe-1')).toBeVisible();
    await expect(page.getByTestId('input-nome-equipe')).toBeVisible();
    await page.getByTestId('input-nome-equipe').fill('Equipe Horizonte Revisada');
    await expect(page.getByTestId('button-salvar-equipe')).toBeVisible();
    await assertControlsFit(page.getByTestId('panel-equipe-1'));
    await assertControlsFit(page.getByTestId('historico-relacao'));
    await assertPageFits();

    const student = page.getByTestId('row-estudante-1');
    await page.getByTestId('button-editar-estudante-1').click();
    await expect(page.getByTestId('input-editar-estudante-1')).toBeVisible();
    await assertControlsFit(student);
    await assertPageFits();
    await page.getByTestId('button-cancelar-edicao-estudante-1').click();

    await page.getByTestId('button-excluir-estudante-1').click();
    await expect(page.getByTestId('confirmacao-excluir-estudante-1')).toBeVisible();
    await assertControlsFit(student);
    await assertPageFits();
    await page.getByTestId('button-cancelar-exclusao-estudante-1').click();

    await page.getByTestId('button-nova-equipe').click();
    const createPanel = page.getByTestId('panel-criar-equipe');
    await expect(createPanel).toBeVisible();
    await page.getByTestId('button-adicionar-estudante-inicial').click();
    await page.getByTestId('button-adicionar-estudante-inicial').click();
    await page.getByTestId('input-nome-equipe').fill('Equipe Nova');
    await page.getByTestId('select-mentor-equipe').selectOption('1');
    await page.getByTestId('input-estudante-inicial-0').fill('Estudante Inicial Um');
    await page.getByTestId('button-salvar-equipe').click();
    const initialStudentsError = page.getByTestId('erro-estudantes-iniciais');
    await expect(initialStudentsError).toBeVisible();
    await expect(initialStudentsError).toContainText('Preencha ou remova os estudantes em branco');
    const errorFits = await initialStudentsError.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 &&
        rect.right <= document.documentElement.clientWidth &&
        element.scrollWidth <= element.clientWidth;
    });
    expect(errorFits, 'initial-student validation message should fit without clipping').toBe(true);
    await assertControlsFit(createPanel);
    await assertPageFits();
    await page.getByTestId('button-cancelar-nova-equipe').click();
  }

  expect(api.mutationRequests, 'mobile maintenance layout checks should not save changes').toEqual([]);
  expect(api.unexpectedRequests, 'mobile interactions should use only the mocked API').toEqual([]);
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