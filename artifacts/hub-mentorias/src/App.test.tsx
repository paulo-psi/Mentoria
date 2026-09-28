import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const roster = [
  {
    id: 1,
    name: 'Equipe Educação',
    mainMentor: { name: 'João Araújo' },
    students: [{ id: 1, name: 'Lívia Gonçalves', sortOrder: 1 }],
  },
  {
    id: 2,
    name: 'Equipe Saúde',
    mainMentor: { name: 'Márcia Évora' },
    students: [{ id: 2, name: 'César Nóbrega', sortOrder: 1 }],
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
    const card = screen.getByTestId(`card-equipe-${id}`);
    expect(screen.queryByTestId(`card-equipe-${id === 1 ? 2 : 1}`)).toBeNull();
    expect(within(card).getByText(roster[id - 1].name)).toBeTruthy();
    expect(within(card).getByText(roster[id - 1].mainMentor.name)).toBeTruthy();
    expect(within(card).getByText(roster[id - 1].students[0].name)).toBeTruthy();
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
    const card = screen.getByTestId('card-equipe-1');
    expect(screen.queryByTestId('card-equipe-2')).toBeNull();
    expect(within(card).getByText('Equipe D’Ávila')).toBeTruthy();
    expect(within(card).getByText('João-Maria')).toBeTruthy();
    expect(within(card).getByText('Ana‑Clara')).toBeTruthy();
  });

  it('encontra uma equipe quando a busca colada contém espaço não separável sem mudar o nome exibido', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByRole('searchbox', { name: 'Buscar equipe, mentor ou estudante' });
    const query = 'Equipe\u00a0Educação';

    await user.click(input);
    await user.paste(query);

    expect(input).toHaveProperty('value', query);
    const card = screen.getByTestId('card-equipe-1');
    expect(screen.queryByTestId('card-equipe-2')).toBeNull();
    expect(within(card).getByText('Equipe Educação')).toBeTruthy();
    expect(within(card).getByText('João Araújo')).toBeTruthy();
    expect(within(card).getByText('Lívia Gonçalves')).toBeTruthy();
  });

  it('encontra uma equipe quando a busca colada usa acentos combinantes sem mudar o nome exibido', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByRole('searchbox', { name: 'Buscar equipe, mentor ou estudante' });
    const query = 'Equipe Educac\u0327a\u0303o';

    await user.click(input);
    await user.paste(query);

    expect(input).toHaveProperty('value', query);
    const card = screen.getByTestId('card-equipe-1');
    expect(screen.queryByTestId('card-equipe-2')).toBeNull();
    expect(within(card).getByText('Equipe Educação')).toBeTruthy();
    expect(within(card).getByText('João Araújo')).toBeTruthy();
    expect(within(card).getByText('Lívia Gonçalves')).toBeTruthy();
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
    const card = screen.getByTestId('card-equipe-1');
    expect(screen.queryByTestId('card-equipe-2')).toBeNull();
    expect(within(card).getByText(nameWithSupplementalMark)).toBeTruthy();
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
    expect(screen.queryByTestId('card-equipe-1')).toBeNull();
    expect(screen.queryByTestId('card-equipe-2')).toBeNull();
  });

  it('não encontra equipe com uma busca que atravessa campos de nome diferentes', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByRole('searchbox', { name: 'Buscar equipe, mentor ou estudante' });

    await user.type(input, 'educacao joao');

    expect(screen.getByText('Nenhuma equipe encontrada.')).toBeTruthy();
    expect(screen.queryByTestId('card-equipe-1')).toBeNull();
    expect(screen.queryByTestId('card-equipe-2')).toBeNull();
  });

  it('mostra o estado sem resultados e limpa a busca, restaurando os nomes originais', async () => {
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByRole('searchbox', { name: 'Buscar equipe, mentor ou estudante' });

    await user.type(input, 'nome inexistente');
    expect(screen.getByText('Nenhuma equipe encontrada.')).toBeTruthy();
    expect(screen.queryByTestId('card-equipe-1')).toBeNull();
    expect(input).toHaveProperty('value', 'nome inexistente');

    await user.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(input).toHaveProperty('value', '');
    expect(screen.getByTestId('card-equipe-1')).toBeTruthy();
    expect(screen.getByTestId('card-equipe-2')).toBeTruthy();
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