import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Team } from '@workspace/api-client-react';
import { Home } from './App';

const { getDashboardStats, getTeams } = vi.hoisted(() => ({
  getDashboardStats: vi.fn(),
  getTeams: vi.fn(),
}));

vi.mock('@workspace/api-client-react', () => ({
  getGetAccessPermissionsQueryKey: () => ['access'],
  getGetDashboardStatsQueryKey: () => ['dashboard-stats'],
  getGetHealthQueryKey: () => ['health'],
  getGetTeamsQueryKey: () => ['teams'],
  getHealthCheckQueryKey: () => ['health-check'],
  useGetAccessPermissions: () => ({ data: { canManage: false }, isError: false, refetch: vi.fn() }),
  useGetDashboardStats: getDashboardStats,
  useHealthCheck: () => ({ data: { status: 'ok' }, isLoading: false, isFetching: false, refetch: vi.fn() }),
  useGetHealth: () => ({ data: { status: 'ok', database: 'connected' }, isLoading: false, isFetching: false, refetch: vi.fn() }),
  useGetTeams: getTeams,
}));

vi.mock('./auth', () => ({
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
  it('exibe dados agregados e mantém o botão de dossiê como placeholder', async () => {
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

    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await user.click(screen.getByRole('button', { name: 'Ver dossiê de Equipe Educação' }));
    expect(info).toHaveBeenCalledWith('Dossiê completo disponível no Marco 3.', {
      teamId: 1,
      teamName: 'Equipe Educação',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    info.mockRestore();
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