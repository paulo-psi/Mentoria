import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MentorOption, Team, TeamSessionHistoryItem } from '@workspace/api-client-react';
import {
  buildMentoringSessionPayload,
  mentoringSessionInputSchema,
} from '@/components/session-registration-form';
import { Home } from './App';

const {
  createSession,
  getAccessPermissions,
  getDashboardStats,
  getMentors,
  getTeamSessions,
  getTeams,
  invalidateQueries,
  showToast,
} = vi.hoisted(() => ({
  createSession: vi.fn(),
  getAccessPermissions: vi.fn(),
  getDashboardStats: vi.fn(),
  getMentors: vi.fn(),
  getTeamSessions: vi.fn(),
  getTeams: vi.fn(),
  invalidateQueries: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('@workspace/api-client-react', () => ({
  getGetAccessPermissionsQueryKey: () => ['access'],
  getGetDashboardStatsQueryKey: () => ['/api/dashboard/stats'],
  getGetMentorsQueryKey: () => ['/api/mentors'],
  getGetTeamSessionsQueryKey: (teamId: number) => [`/api/teams/${teamId}/sessions`],
  getGetHealthQueryKey: () => ['health'],
  getGetTeamsQueryKey: () => ['/api/teams'],
  getHealthCheckQueryKey: () => ['health-check'],
  useCreateMentoringSession: () => ({ isPending: false, mutateAsync: createSession }),
  useGetAccessPermissions: getAccessPermissions,
  useGetDashboardStats: getDashboardStats,
  useGetMentors: getMentors,
  useGetTeamSessions: getTeamSessions,
  useHealthCheck: () => ({ data: { status: 'ok' }, isLoading: false, isFetching: false, refetch: vi.fn() }),
  useGetHealth: () => ({ data: { status: 'ok', database: 'connected' }, isLoading: false, isFetching: false, refetch: vi.fn() }),
  useGetTeams: getTeams,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries }),
  };
});

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: showToast, toasts: [] }),
}));

vi.mock('./auth', () => ({
  AccountSettingsPage: () => null,
  UserProfileButton: () => null,
}));

const roster: Team[] = [
  {
    id: 1,
    name: 'Equipe Educação',
    pitchSummary: 'Ferramentas digitais para apoiar a aprendizagem.',
    currentStage: 'Validação',
    createdAt: '2026-01-01T00:00:00.000Z',
    mainMentor: {
      id: 1,
      name: 'João Araújo',
      email: null,
      expertiseArea: 'Educação & Produto',
      mentorType: null,
    },
    students: [{ id: 1, name: 'Lívia Gonçalves', sortOrder: 1 }],
    sessionCount: 3,
    totalSessions: 3,
    transversalSessionCount: 1,
    lastSessionDate: '2026-03-29',
    lastSessionScore: 8,
    latestAgreedNextSteps: 'Concluir testes com usuários.',
  },
  {
    id: 2,
    name: 'Equipe Saúde',
    pitchSummary: 'Acompanhamento de saúde preventiva.',
    currentStage: 'Descoberta',
    createdAt: '2026-01-02T00:00:00.000Z',
    mainMentor: {
      id: 2,
      name: 'Márcia Évora',
      email: null,
      expertiseArea: 'Saúde & Produto',
      mentorType: null,
    },
    students: [{ id: 2, name: 'César Nóbrega', sortOrder: 1 }],
    sessionCount: 0,
    totalSessions: 0,
    transversalSessionCount: 0,
    lastSessionDate: null,
    lastSessionScore: null,
    latestAgreedNextSteps: null,
  },
];

const mentorOptions: MentorOption[] = [
  {
    id: 1,
    name: 'João Araújo',
    email: 'joao@example.org',
    expertiseArea: 'Educação & Produto',
    mentorType: 'interno',
    totalSessions: 3,
    avgNpsReceived: 8.7,
    assignedTeamsCount: 2,
  },
  {
    id: 2,
    name: 'Márcia Évora',
    email: null,
    expertiseArea: 'Saúde & Produto',
    mentorType: null,
    totalSessions: 0,
    avgNpsReceived: null,
    assignedTeamsCount: 0,
  },
];

const longMentorAssessment =
  'Parecer integral sobre a maturidade e as entregas da equipe, com evidências e recomendações detalhadas. '.repeat(
    80,
  );

const dossierSessions: TeamSessionHistoryItem[] = [
  {
    id: 301,
    sessionDate: '2026-03-24',
    sessionType: 'principal',
    mentor: {
      id: 41,
      name: 'Carolina Nunes',
      expertiseArea: 'Estratégia e Produto',
      mentorType: 'interno',
    },
    scores: {
      teamNps: 9,
      teamActionability: 8,
      mentorCommitment: 10,
      mentorTraction: 7,
    },
    qualitative: {
      mentorQualitativeAssessment: longMentorAssessment,
      teamFeedbackStrongPoints: 'Comunicação clara e validação consistente.',
      teamFeedbackImprovements: 'Ampliar a amostra de entrevistas.',
      agreedNextSteps: 'Concluir cinco entrevistas com usuários até sexta-feira.',
    },
    createdAt: '2026-03-24T15:00:00.000Z',
  },
];

const punctuationVariantRoster = [
  {
    ...roster[0],
    name: 'Equipe D’Ávila',
    mainMentor: { ...roster[0].mainMentor, name: 'João-Maria' },
    students: [{ ...roster[0].students[0], name: 'Ana‑Clara' }],
  },
  {
    ...roster[1],
    name: 'Equipe D Avila',
    mainMentor: { ...roster[1].mainMentor, name: 'João Maria' },
    students: [{ ...roster[1].students[0], name: 'Ana Clara' }],
  },
];

beforeEach(() => {
  getAccessPermissions.mockReturnValue({
    data: { canManage: false },
    isError: false,
    refetch: vi.fn(),
  });
  getMentors.mockReturnValue({
    data: mentorOptions,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  });
  createSession.mockResolvedValue(undefined);
  invalidateQueries.mockResolvedValue(undefined);
  getTeamSessions.mockReturnValue({
    data: [],
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  });
  getDashboardStats.mockReturnValue({
    data: {
      totalSessions: 18,
      avgNps: 8.6,
      avgTraction: 8.5,
      networkOpennessRate: 41.7,
    },
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  });
  getTeams.mockReturnValue({
    data: roster,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
});

describe('visão consolidada de mentores', () => {
  it('alternates between teams and mentor metrics without reloading and searches the mentor list', async () => {
    const user = userEvent.setup();
    render(<Home />);

    expect(screen.getByRole('tab', { name: /Equipes/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Mentores/ })).toBeTruthy();
    expect(screen.getByTestId('count-tab-equipes').textContent).toBe('2');
    expect(screen.getByTestId('count-tab-mentores').textContent).toBe('2');
    expect(screen.getByTestId('table-executive-teams')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /Mentores/ }));

    expect(screen.getByRole('heading', { name: 'Painel de Mentores' })).toBeTruthy();
    expect(screen.getByTestId('text-mentores-count').textContent).toBe('2 mentores cadastrados');
    expect(screen.getByTestId('table-mentores')).toBeTruthy();
    const firstRow = screen.getByTestId('row-mentor-1');
    expect(within(firstRow).getByText('joao@example.org')).toBeTruthy();
    expect(within(firstRow).getByText('Educação & Produto')).toBeTruthy();
    expect(within(firstRow).getByTestId('text-sessoes-mentor-1').textContent).toBe('3 sessões');
    expect(within(firstRow).getByTestId('text-nps-mentor-1').textContent).toContain('8,7');
    expect(within(firstRow).getByTestId('text-equipes-mentor-1').textContent).toBe('2 equipes');
    expect(within(screen.getByTestId('row-mentor-2')).getByText('Sem avaliações')).toBeTruthy();

    const searchInput = screen.getByRole('searchbox', { name: 'Buscar mentor, e-mail ou especialidade' });
    await user.type(searchInput, 'joao@example.org');
    expect(screen.getByTestId('row-mentor-1')).toBeTruthy();
    expect(screen.queryByTestId('row-mentor-2')).toBeNull();

    await user.click(screen.getByRole('tab', { name: /Equipes/ }));
    expect(screen.getByTestId('table-executive-teams')).toBeTruthy();
    expect(screen.queryByTestId('table-mentores')).toBeNull();
  });

  it('shows loading, retryable error, empty-list, and no-search-result states', async () => {
    const retry = vi.fn();
    getMentors.mockReturnValue({
      data: undefined,
      isError: false,
      isFetching: true,
      isLoading: true,
      refetch: retry,
    });
    const user = userEvent.setup();
    const { rerender } = render(<Home />);
    await user.click(screen.getByRole('tab', { name: /Mentores/ }));
    expect(screen.getByTestId('loading-mentores')).toBeTruthy();

    getMentors.mockReturnValue({
      data: undefined,
      error: { status: 503 },
      isError: true,
      isFetching: false,
      isLoading: false,
      refetch: retry,
    });
    rerender(<Home />);
    expect(screen.getByTestId('state-erro-mentores')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(retry).toHaveBeenCalledTimes(1);

    getMentors.mockReturnValue({
      data: [],
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: retry,
    });
    rerender(<Home />);
    expect(screen.getByText('Nenhum mentor cadastrado.')).toBeTruthy();
    await user.type(screen.getByRole('searchbox', { name: 'Buscar mentor, e-mail ou especialidade' }), 'inexistente');
    expect(screen.getByText('Nenhum mentor encontrado.')).toBeTruthy();
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('busca de equipes', () => {
  it.each([
    ['equipe', 'Educacao', 1],
    ['equipe', 'EDUCAÇÃO', 1],
    ['equipe', 'Equipe   Educação', 1],
    ['mentor', 'joao araujo', 1],
    ['mentor', 'JOÃO ARAÚJO', 1],
    ['mentor', 'João    Araújo', 1],
    ['estudante', 'livia goncalves', 1],
    ['estudante', 'LÍVIA GONÇALVES', 1],
    ['estudante', 'Lívia  Gonçalves', 1],
    ['equipe', 'saude', 2],
    ['mentor', 'marcia evora', 2],
    ['estudante', 'cesar nobrega', 2],
  ])('encontra %s com a busca "%s" sem mudar a grafia', async (_kind, query, id) => {
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByRole('searchbox', { name: 'Buscar equipe, mentor ou estudante' });

    await user.type(input, query);

    expect(input).toHaveProperty('value', query);
    const row = screen.getByTestId(`row-equipe-${id}`);
    expect(screen.queryByTestId(`row-equipe-${id === 1 ? 2 : 1}`)).toBeNull();
    expect(within(row).getByText(roster[id - 1].name)).toBeTruthy();
    expect(within(row).getByText(roster[id - 1].mainMentor.name)).toBeTruthy();
  });

  it.each([
    ['equipe', "Equipe D'Ávila"],
    ['mentor', 'João‐Maria'],
    ['estudante', 'Ana—Clara'],
  ])('encontra %s quando a pontuação colada varia sem alterar a grafia original', async (_kind, query) => {
    getTeams.mockReturnValue({
      data: punctuationVariantRoster,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByRole('searchbox', { name: 'Buscar equipe, mentor ou estudante' });

    await user.click(input);
    await user.paste(query);

    expect(input).toHaveProperty('value', query);
    const row = screen.getByTestId('row-equipe-1');
    expect(screen.queryByTestId('row-equipe-2')).toBeNull();
    expect(within(row).getByText('Equipe D’Ávila')).toBeTruthy();
    expect(within(row).getByText('João-Maria')).toBeTruthy();
  });

  it('encontra uma equipe quando a busca colada contém espaço não separável sem mudar o nome exibido', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByRole('searchbox', { name: 'Buscar equipe, mentor ou estudante' });
    const query = 'Equipe\u00a0Educação';

    await user.click(input);
    await user.paste(query);

    expect(input).toHaveProperty('value', query);
    const row = screen.getByTestId('row-equipe-1');
    expect(screen.queryByTestId('row-equipe-2')).toBeNull();
    expect(within(row).getByText('Equipe Educação')).toBeTruthy();
    expect(within(row).getByText('João Araújo')).toBeTruthy();
  });

  it('encontra uma equipe quando a busca colada usa acentos combinantes sem mudar o nome exibido', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByRole('searchbox', { name: 'Buscar equipe, mentor ou estudante' });
    const query = 'Equipe Educac\u0327a\u0303o';

    await user.click(input);
    await user.paste(query);

    expect(input).toHaveProperty('value', query);
    const row = screen.getByTestId('row-equipe-1');
    expect(screen.queryByTestId('row-equipe-2')).toBeNull();
    expect(within(row).getByText('Equipe Educação')).toBeTruthy();
    expect(within(row).getByText('João Araújo')).toBeTruthy();
  });

  it('encontra nome com marca combinante suplementar em busca colada sem alterar a grafia exibida', async () => {
    const nameWithSupplementalMark = 'A\u1ab0na';
    getTeams.mockReturnValue({
      data: roster.map((team) =>
        team.id === 1
          ? {
              ...team,
              students: [{ ...team.students[0], name: nameWithSupplementalMark }],
            }
          : team,
      ),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByRole('searchbox', { name: 'Buscar equipe, mentor ou estudante' });

    await user.click(input);
    await user.paste('Ana');

    expect(input).toHaveProperty('value', 'Ana');
    const row = screen.getByTestId('row-equipe-1');
    expect(screen.queryByTestId('row-equipe-2')).toBeNull();
    expect(within(row).getByText('Equipe Educação')).toBeTruthy();
  });

  it('preserva sinais vocálicos que distinguem nomes em outros sistemas de escrita', async () => {
    getTeams.mockReturnValue({
      data: roster.map((team) =>
        team.id === 1
          ? {
              ...team,
              students: [{ ...team.students[0], name: 'कि' }],
            }
          : team,
      ),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByRole('searchbox', { name: 'Buscar equipe, mentor ou estudante' });

    await user.click(input);
    await user.paste('कु');

    expect(screen.getByText('Nenhuma equipe encontrada.')).toBeTruthy();
    expect(screen.queryByTestId('row-equipe-1')).toBeNull();
    expect(screen.queryByTestId('row-equipe-2')).toBeNull();
  });

  it('não encontra equipe com uma busca que atravessa campos de nome diferentes', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByRole('searchbox', { name: 'Buscar equipe, mentor ou estudante' });

    await user.type(input, 'educacao joao');

    expect(screen.getByText('Nenhuma equipe encontrada.')).toBeTruthy();
    expect(screen.queryByTestId('row-equipe-1')).toBeNull();
    expect(screen.queryByTestId('row-equipe-2')).toBeNull();
  });

  it('mostra o estado sem resultados e limpa a busca, restaurando os nomes originais', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByRole('searchbox', { name: 'Buscar equipe, mentor ou estudante' });

    await user.type(input, 'nome inexistente');
    expect(screen.getByText('Nenhuma equipe encontrada.')).toBeTruthy();
    expect(screen.queryByTestId('row-equipe-1')).toBeNull();
    expect(input).toHaveProperty('value', 'nome inexistente');

    await user.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(input).toHaveProperty('value', '');
    expect(screen.getByTestId('row-equipe-1')).toBeTruthy();
    expect(screen.getByTestId('row-equipe-2')).toBeTruthy();
    expect(screen.getByText('Equipe Educação')).toBeTruthy();
    expect(screen.getByText('Equipe Saúde')).toBeTruthy();
    expect(screen.queryByTestId('state-vazio-equipes')).toBeNull();
  });

  it('distingue uma relação vazia de uma busca sem resultados', async () => {
    getTeams.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    render(<Home />);
    expect(screen.getByText('Nenhuma equipe neste ciclo.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Limpar busca' })).toBeNull();

    await user.type(screen.getByRole('searchbox', { name: 'Buscar equipe, mentor ou estudante' }), 'joao');
    expect(screen.getByText('Nenhuma equipe encontrada.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getByText('Nenhuma equipe neste ciclo.')).toBeTruthy();
  });
});

describe('tabela executiva de equipes', () => {
  it('exibe os dados agregados e abre o dossiê com todos os dados da API', async () => {
    getTeamSessions.mockReturnValue({
      data: dossierSessions,
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    render(<Home />);

    expect(screen.getByTestId('text-equipes-heading').textContent).toBe('Equipes em Acompanhamento');
    expect(screen.getByTestId('text-equipes-count').textContent).toBe('2 startups ativas no ciclo');
    expect(screen.getByTestId('table-executive-teams')).toBeTruthy();

    const row = screen.getByTestId('row-equipe-1');
    expect(within(row).getByTestId('text-proposta-1').textContent).toContain('Ferramentas digitais');
    expect(within(row).getByTestId('text-estagio-1').textContent).toBe('Validação');
    expect(within(row).getByTestId('text-mentor-1').textContent).toBe('João Araújo');
    expect(within(row).getByTestId('text-sessoes-1').textContent).toBe('3 sessões');
    expect(within(row).getByTestId('text-sessoes-transversais-1').textContent).toContain('1 transversal/externa');
    expect(within(row).getByTestId('text-ultima-avaliacao-1').textContent).toBe('8/10');
    expect(row.textContent).toContain('29/03/2026');
    expect(within(row).getByTestId('text-proximo-passo-1').textContent).toBe('Concluir testes com usuários.');

    const trigger = screen.getByRole('button', { name: 'Ver dossiê de Equipe Educação' });
    await user.click(trigger);

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(getTeamSessions).toHaveBeenCalledWith(1, {
      query: { enabled: true, queryKey: ['/api/teams/1/sessions'] },
    });
    expect(screen.getByTestId('text-dossie-equipe').textContent).toBe('Equipe Educação');
    expect(screen.getByTestId('badge-estagio-equipe').textContent).toBe('Validação');
    expect(screen.getByTestId('badge-mentor-principal').textContent).toContain('João Araújo');
    expect(screen.getByTestId('text-data-sessao-301').textContent).toBe('24 de março de 2026');
    expect(screen.getByTestId('badge-tipo-sessao-301').textContent).toBe('Principal');
    expect(screen.getByTestId('text-mentor-sessao-301').textContent).toContain('Carolina Nunes');
    expect(screen.getByTestId('nota-301-teamNps').textContent).toContain('9');
    expect(screen.getByTestId('nota-301-teamActionability').textContent).toContain('8');
    expect(screen.getByTestId('nota-301-mentorCommitment').textContent).toContain('10');
    expect(screen.getByTestId('nota-301-mentorTraction').textContent).toContain('7');
    expect(screen.getByTestId('parecer-mentor-301').textContent).toContain(longMentorAssessment);
    expect(screen.getByTestId('pontos-fortes-301').textContent).toBe(
      'Pontos fortes da equipeComunicação clara e validação consistente.',
    );
    expect(screen.getByTestId('oportunidades-melhoria-301').textContent).toBe(
      'Oportunidades de melhoriaAmpliar a amostra de entrevistas.',
    );
    expect(screen.getByTestId('proximos-passos-301').textContent).toContain(
      'Concluir cinco entrevistas com usuários até sexta-feira.',
    );

    await user.click(screen.getByTestId('button-fechar-dossie'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('fecha o dossiê com Escape e restaura o foco para o botão que o abriu', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const trigger = screen.getByRole('button', { name: 'Ver dossiê de Equipe Educação' });

    await user.click(trigger);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('fecha o dossiê ao clicar no backdrop e restaura o foco para o botão que o abriu', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const trigger = screen.getByRole('button', { name: 'Ver dossiê de Equipe Educação' });

    await user.click(trigger);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    await user.click(screen.getByTestId('dossie-backdrop'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('mostra o skeleton enquanto o histórico carrega', async () => {
    getTeamSessions.mockReturnValue({
      data: undefined,
      isError: false,
      isFetching: true,
      isLoading: true,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole('button', { name: 'Ver dossiê de Equipe Educação' }));

    expect(await screen.findByTestId('loading-sessoes')).toBeTruthy();
    expect(screen.getByTestId('skeleton-sessao-1')).toBeTruthy();
  });

  it('mostra o estado vazio quando a equipe ainda não tem mentorias', async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole('button', { name: 'Ver dossiê de Equipe Saúde' }));

    expect((await screen.findByTestId('state-vazio-sessoes')).textContent).toBe(
      'Nenhuma mentoria registrada para esta equipe até o momento.',
    );
  });

  it('permite tentar novamente quando o histórico falha', async () => {
    const retry = vi.fn();
    getTeamSessions.mockReturnValue({
      data: undefined,
      isError: true,
      isFetching: false,
      isLoading: false,
      refetch: retry,
    });
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole('button', { name: 'Ver dossiê de Equipe Educação' }));
    expect(await screen.findByTestId('state-erro-sessoes')).toBeTruthy();
    await user.click(screen.getByTestId('button-tentar-novamente-sessoes'));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('mostra linhas skeleton enquanto as equipes carregam', () => {
    getTeams.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isFetching: true,
      refetch: vi.fn(),
    });
    render(<Home />);

    expect(screen.getByTestId('loading-equipes')).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Carregando equipes' })).toBeTruthy();
  });
});

describe('visão geral do ciclo', () => {
  it('mostra os quatro indicadores retornados pelo hook de métricas', () => {
    render(<Home />);

    expect(screen.getByTestId('text-dashboard-kpis-heading').textContent).toBe('Visão Geral do Ciclo');
    expect(screen.getByTestId('value-kpi-sessions').textContent).toBe('18');
    expect(screen.getByTestId('value-kpi-nps').textContent).toBe('8.6');
    expect(screen.getByTestId('value-kpi-traction').textContent).toBe('8.5');
    expect(screen.getByTestId('value-kpi-network-openness').textContent).toBe('41.7%');
    expect(screen.getByRole('button', { name: 'Novo registro, disponível em uma próxima etapa' }).hasAttribute('disabled')).toBe(true);
  });

  it('mostra esqueletos enquanto as métricas carregam', () => {
    getDashboardStats.mockReturnValue({
      data: undefined,
      isError: false,
      isFetching: true,
      isLoading: true,
      refetch: vi.fn(),
    });

    render(<Home />);

    expect(screen.getByTestId('loading-kpis')).toBeTruthy();
    expect(screen.queryByTestId('grid-kpis')).toBeNull();
  });

  it('permite repetir a consulta quando as métricas falham', async () => {
    const retry = vi.fn();
    getDashboardStats.mockReturnValue({
      data: undefined,
      isError: true,
      isFetching: false,
      isLoading: false,
      refetch: retry,
    });
    const user = userEvent.setup();
    render(<Home />);

    expect(screen.getByTestId('state-kpis-erro')).toBeTruthy();
    await user.click(screen.getByTestId('button-tentar-novamente-kpis'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('registro de mentorias', () => {
  function authorizeCoordinator() {
    getAccessPermissions.mockReturnValue({
      data: { canManage: true },
      isError: false,
      refetch: vi.fn(),
    });
  }

  it('abre o modal para coordenação e sugere o mentor principal de cada equipe', async () => {
    authorizeCoordinator();
    const user = userEvent.setup();
    render(<Home />);

    const trigger = screen.getByRole('button', { name: 'Novo registro' });
    expect(trigger.hasAttribute('disabled')).toBe(false);
    await user.click(trigger);

    expect(await screen.findByRole('dialog', { name: 'Novo registro de mentoria' })).toBeTruthy();
    expect(getMentors).toHaveBeenCalledWith({
      query: {
        enabled: true,
        queryKey: ['/api/mentors'],
        staleTime: 30_000,
      },
    });
    expect(screen.getByRole('heading', { name: 'Contexto do Encontro' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Avaliação da Equipe' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Avaliação do Mentor' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Próximos Passos' })).toBeTruthy();
    expect((screen.getByTestId('select-equipe-registro') as HTMLSelectElement).value).toBe('1');
    expect((screen.getByTestId('select-mentor-sessao-registro') as HTMLSelectElement).value).toBe('1');
    expect(screen.getByTestId('status-mentor-sugerido').textContent).toContain(
      'Mentor principal sugerido automaticamente',
    );
    expect((screen.getByTestId('input-data-sessao-registro') as HTMLInputElement).value).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );

    await user.selectOptions(screen.getByTestId('select-equipe-registro'), '2');
    await waitFor(() => {
      expect((screen.getByTestId('select-mentor-sessao-registro') as HTMLSelectElement).value).toBe('2');
    });
    await user.click(screen.getByTestId('button-cancelar-sessao-registro'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(createSession).not.toHaveBeenCalled();
  });

  it('valida notas inteiras, campos obrigatórios e datas de calendário reais com Zod', () => {
    const validForm = {
      mentorId: '1',
      sessionType: 'principal',
      sessionDate: '2026-02-28',
      teamNps: '0',
      teamActionability: '10',
      mentorCommitment: '8',
      mentorTraction: '9',
      teamFeedbackStrongPoints: 'Boa comunicação.',
      teamFeedbackImprovements: 'Ampliar entrevistas.',
      agreedNextSteps: 'Concluir os testes.',
      mentorQualitativeAssessment: 'A equipe avançou com consistência.',
    } as const;

    expect(mentoringSessionInputSchema.safeParse(validForm).success).toBe(true);
    expect(
      mentoringSessionInputSchema.safeParse({ ...validForm, sessionDate: '2026-02-31' }).success,
    ).toBe(false);
    expect(
      mentoringSessionInputSchema.safeParse({ ...validForm, teamNps: '11' }).success,
    ).toBe(false);
    expect(
      mentoringSessionInputSchema.safeParse({ ...validForm, teamNps: '3.5' }).success,
    ).toBe(false);
    expect(
      mentoringSessionInputSchema.safeParse({ ...validForm, teamFeedbackStrongPoints: '   ' }).success,
    ).toBe(false);
    expect(
      mentoringSessionInputSchema.safeParse({
        ...validForm,
        teamFeedbackStrongPoints: 'a'.repeat(5001),
      }).success,
    ).toBe(false);

    const parsed = mentoringSessionInputSchema.parse(validForm);
    expect(parsed.mentorId).toBe('1');
    const payload = buildMentoringSessionPayload(parsed);
    expect(payload.mentorId).toBe(1);
    expect(payload.teamNps).toBe(0);
    expect(payload.teamActionability).toBe(10);
  });

  it('impede salvar o formulário vazio e mostra as validações junto aos campos', async () => {
    authorizeCoordinator();
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole('button', { name: 'Novo registro' }));
    await screen.findByRole('dialog');
    await user.selectOptions(screen.getByTestId('select-mentor-sessao-registro'), '');
    fireEvent.change(screen.getByTestId('input-data-sessao-registro'), {
      target: { value: '' },
    });
    await user.click(screen.getByTestId('button-salvar-sessao-registro'));

    expect(createSession).not.toHaveBeenCalled();
    expect(screen.getByText('Informe a data da sessão.')).toBeTruthy();
    expect(screen.getByText('Selecione o mentor que conduziu a sessão.')).toBeTruthy();
    expect(screen.getByText('Selecione uma nota para o nps da mentoria.')).toBeTruthy();
    expect(screen.getAllByText('Preencha este campo.')).toHaveLength(4);
  });

  it('salva a mentoria, invalida o painel e mostra o novo registro no dossiê', async () => {
    authorizeCoordinator();
    const user = userEvent.setup();
    render(<Home />);

    await user.click(screen.getByRole('button', { name: 'Novo registro' }));
    await screen.findByRole('dialog');
    await user.selectOptions(screen.getByTestId('select-equipe-registro'), '2');
    await user.selectOptions(screen.getByTestId('select-tipo-sessao-registro'), 'transversal');
    fireEvent.change(screen.getByTestId('input-data-sessao-registro'), {
      target: { value: '2026-05-12' },
    });
    await user.selectOptions(screen.getByTestId('select-mentor-sessao-registro'), '1');
    await user.selectOptions(screen.getByTestId('select-teamNps-sessao-registro'), '10');
    await user.selectOptions(screen.getByTestId('select-teamActionability-sessao-registro'), '8');
    await user.selectOptions(screen.getByTestId('select-mentorCommitment-sessao-registro'), '7');
    await user.selectOptions(screen.getByTestId('select-mentorTraction-sessao-registro'), '9');
    await user.type(
      screen.getByTestId('textarea-teamFeedbackStrongPoints-registro'),
      'Comunicação clara e validação consistente.',
    );
    await user.type(
      screen.getByTestId('textarea-teamFeedbackImprovements-registro'),
      'Ampliar a amostra de entrevistas.',
    );
    await user.type(
      screen.getByTestId('textarea-mentorQualitativeAssessment-registro'),
      'A equipe demonstrou tração e boa capacidade de execução.',
    );
    await user.type(
      screen.getByTestId('textarea-agreedNextSteps-registro'),
      'Concluir cinco entrevistas até sexta-feira.',
    );

    await user.click(screen.getByTestId('button-salvar-sessao-registro'));

    await waitFor(() =>
      expect(createSession).toHaveBeenCalledWith({
        teamId: 2,
        data: {
          mentorId: 1,
          sessionType: 'transversal',
          sessionDate: '2026-05-12',
          teamNps: 10,
          teamActionability: 8,
          mentorCommitment: 7,
          mentorTraction: 9,
          teamFeedbackStrongPoints: 'Comunicação clara e validação consistente.',
          teamFeedbackImprovements: 'Ampliar a amostra de entrevistas.',
          agreedNextSteps: 'Concluir cinco entrevistas até sexta-feira.',
          mentorQualitativeAssessment: 'A equipe demonstrou tração e boa capacidade de execução.',
        },
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(invalidateQueries).toHaveBeenCalledTimes(3);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['/api/dashboard/stats'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['/api/teams'] });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['/api/teams/2/sessions'],
    });
    expect(showToast).toHaveBeenCalledWith({
      title: 'Sessão registrada',
      description: 'O histórico de Equipe Saúde foi atualizado.',
    });

    getTeamSessions.mockReturnValue({
      data: [
        {
          id: 302,
          sessionDate: '2026-05-12',
          sessionType: 'transversal',
          mentor: {
            id: 1,
            name: 'João Araújo',
            expertiseArea: 'Educação & Produto',
            mentorType: 'interno',
          },
          scores: {
            teamNps: 10,
            teamActionability: 8,
            mentorCommitment: 7,
            mentorTraction: 9,
          },
          qualitative: {
            mentorQualitativeAssessment: 'A equipe demonstrou tração e boa capacidade de execução.',
            teamFeedbackStrongPoints: 'Comunicação clara e validação consistente.',
            teamFeedbackImprovements: 'Ampliar a amostra de entrevistas.',
            agreedNextSteps: 'Concluir cinco entrevistas até sexta-feira.',
          },
          createdAt: '2026-05-12T15:00:00.000Z',
        },
      ] satisfies TeamSessionHistoryItem[],
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    await user.click(screen.getByRole('button', { name: 'Ver dossiê de Equipe Saúde' }));
    expect(await screen.findByTestId('sessao-mentoria-302')).toBeTruthy();
    expect(screen.getByTestId('parecer-mentor-302').textContent).toContain(
      'A equipe demonstrou tração e boa capacidade de execução.',
    );
  });
});