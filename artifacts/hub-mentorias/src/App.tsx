import { useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  CalendarCheck2,
  CheckCircle2,
  CircleAlert,
  Mail,
  RefreshCw,
  Search,
  UsersRound,
  Waypoints,
} from 'lucide-react';
import {
  getGetHealthQueryKey,
  getGetTeamsQueryKey,
  getHealthCheckQueryKey,
  useGetHealth,
  useGetTeams,
  useHealthCheck,
} from '@workspace/api-client-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const [search, setSearch] = useState('');
  const healthCheck = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      staleTime: 30_000,
    },
  });
  const health = useGetHealth({
    query: {
      queryKey: getGetHealthQueryKey(),
      staleTime: 30_000,
    },
  });
  const teams = useGetTeams({
    query: {
      queryKey: getGetTeamsQueryKey(),
      staleTime: 30_000,
    },
  });

  const filteredTeams = useMemo(() => {
    const source = teams.data ?? [];
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    if (!normalizedSearch) return source;
    return source.filter((team) =>
      [team.name, team.pitchSummary, team.currentStage, team.mainMentor.name]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedSearch),
    );
  }, [search, teams.data]);

  const apiAvailable = healthCheck.data?.status === 'ok';
  const connected =
    apiAvailable &&
    health.data?.status === 'ok' &&
    health.data.database === 'connected';

  const refreshAll = () => {
    void healthCheck.refetch();
    void health.refetch();
    void teams.refetch();
  };

  return (
    <div className="grain min-h-[100dvh] w-full bg-background text-foreground">
      <header className="border-b border-border/70 bg-card/70">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Waypoints size={19} />
            </span>
            <span className="font-display text-xl">Hub de Mentorias</span>
          </div>
          <button
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold transition-colors hover:bg-muted"
            data-testid="button-atualizar"
            onClick={refreshAll}
            type="button"
          >
            <RefreshCw
              className={health.isFetching || teams.isFetching ? 'animate-spin' : ''}
              size={14}
            />
            Atualizar
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-5 pb-12 pt-10 sm:px-8">
        <div className="mb-9">
          <div
            className={`mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
              connected
                ? 'bg-emerald-100 text-emerald-800'
                : health.isLoading || healthCheck.isLoading
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-red-100 text-red-800'
            }`}
            data-testid="status-api"
            role="status"
          >
            {connected ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
            {connected
              ? 'API Conectada'
              : health.isLoading || healthCheck.isLoading
                ? 'Verificando conexão'
                : 'API Indisponível'}
          </div>
          <h1 className="font-display text-[40px] leading-tight tracking-[-0.04em] sm:text-[48px]">
            Equipes
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Listagem inicial de equipes, mentores principais e sessões cadastradas no banco.
          </p>
        </div>

        <section>
            <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <div className="mb-2 font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">
                  dados de teste
                </div>
                <h2 className="font-display text-2xl tracking-[-0.035em]">
                  {teams.isLoading ? 'Carregando equipes…' : `${teams.data?.length ?? 0} equipes cadastradas`}
                </h2>
              </div>
              <label className="relative block w-full sm:w-[242px]">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={15}
                />
                <input
                  className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-xs text-foreground outline-none transition-shadow placeholder:text-muted-foreground/75 focus:ring-2 focus:ring-primary/20"
                  data-testid="input-buscar-equipes"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar equipe ou mentor"
                  type="search"
                  value={search}
                />
              </label>
            </div>

            {teams.isLoading ? (
              <TeamSkeletonGrid />
            ) : teams.isError ? (
              <ErrorState onRetry={refreshAll} />
            ) : filteredTeams.length === 0 ? (
              <EmptyState hasSearch={Boolean(search)} onClear={() => setSearch('')} />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredTeams.map((team, index) => (
                  <TeamCard index={index} key={team.id} team={team} />
                ))}
              </div>
            )}
        </section>
      </main>
    </div>
  );
}

function TeamCard({
  team,
  index,
}: {
  team: {
    id: number;
    name: string;
    pitchSummary: string;
    currentStage: string;
    createdAt: string;
    mainMentor: {
      name: string;
      email: string;
      expertiseArea: string;
      mentorType: string;
    };
    sessionCount: number;
  };
  index: number;
}) {
  const initials = team.mainMentor.name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const created = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(team.createdAt));
  const stageTone =
    team.currentStage.toLocaleLowerCase('pt-BR').includes('valida')
      ? 'bg-[#f6e4bb] text-[#85632a]'
      : team.currentStage.toLocaleLowerCase('pt-BR').includes('escala')
        ? 'bg-[#dcebe3] text-[#2d6958]'
        : 'bg-[#e7e5d9] text-[#5d665b]';

  return (
    <article
      className={`animate-rise-in delay-${Math.min(index + 3, 5)} group rounded-2xl border border-border bg-card p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-27px_hsl(184_26%_17%_/_0.6)]`}
      data-testid={`card-equipe-${team.id}`}
    >
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 font-mono-ui text-[9px] uppercase tracking-[0.08em] ${stageTone}`} data-testid={`status-estagio-${team.id}`}>
              {team.currentStage}
            </span>
            <span className="font-mono-ui text-[9px] text-muted-foreground">#{String(team.id).padStart(2, '0')}</span>
          </div>
          <h3 className="truncate font-display text-[25px] tracking-[-0.04em]" data-testid={`text-equipe-${team.id}`}>
            {team.name}
          </h3>
          <p className="mt-2 line-clamp-2 max-w-[470px] text-xs leading-5 text-muted-foreground" data-testid={`text-pitch-${team.id}`}>
            {team.pitchSummary}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[1fr_auto] items-end gap-4 border-t border-border/70 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-xs font-semibold text-primary" data-testid={`avatar-mentor-${team.id}`}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold" data-testid={`text-mentor-${team.id}`}>{team.mainMentor.name}</p>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="truncate">{team.mainMentor.expertiseArea}</span>
              <span className="text-border">·</span>
              <span className="shrink-0 capitalize">{team.mainMentor.mentorType}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5 text-primary">
            <CalendarCheck2 size={14} />
            <span className="font-display text-xl tracking-[-0.04em]" data-testid={`text-sessoes-${team.id}`}>{team.sessionCount}</span>
          </div>
          <p className="mt-1 font-mono-ui text-[9px] uppercase tracking-[0.08em] text-muted-foreground">sessões</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><Mail size={12} /> {team.mainMentor.email}</span>
        <span className="font-mono-ui text-[9px]">{created}</span>
      </div>
    </article>
  );
}

function TeamSkeletonGrid() {
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="loading-equipes">
      {Array.from({ length: 6 }).map((_, index) => (
        <div className="h-[250px] animate-pulse rounded-2xl border border-border bg-card p-5" key={index}>
          <div className="h-5 w-24 rounded bg-muted" />
          <div className="mt-6 h-8 w-52 rounded bg-muted" />
          <div className="mt-3 h-4 w-4/5 rounded bg-muted" />
          <div className="mt-10 h-px bg-muted" />
          <div className="mt-5 h-8 w-40 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-12 text-center" data-testid="state-erro-equipes">
      <CircleAlert className="mx-auto mb-4 text-destructive" size={25} />
      <h3 className="font-display text-2xl tracking-[-0.03em]">As equipes não carregaram.</h3>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
        O serviço respondeu com um erro. Atualize a leitura para tentar novamente.
      </p>
      <button
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        data-testid="button-tentar-novamente"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw size={14} /> Tentar novamente
      </button>
    </div>
  );
}

function EmptyState({ hasSearch, onClear }: { hasSearch: boolean; onClear: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center" data-testid="state-vazio-equipes">
      <UsersRound className="mx-auto mb-4 text-muted-foreground" size={25} />
      <h3 className="font-display text-2xl tracking-[-0.03em]">
        {hasSearch ? 'Nenhuma equipe encontrada.' : 'Nenhuma equipe neste ciclo.'}
      </h3>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {hasSearch ? 'Tente outro nome, etapa ou mentor.' : 'Quando houver equipes, elas aparecerão aqui.'}
      </p>
      {hasSearch && (
        <button className="mt-5 text-xs font-semibold text-primary underline underline-offset-4" data-testid="button-limpar-busca" onClick={onClear} type="button">
          Limpar busca
        </button>
      )}
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
