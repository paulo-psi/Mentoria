import { useMemo, useState, type ReactNode } from 'react';
import { ClerkProvider, Show } from '@clerk/react';
import { ptBR } from '@clerk/localizations';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  CheckCircle2,
  CircleAlert,
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
  Redirect,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import {
  basePath,
  clerkAppearance,
  clerkProxyUrl,
  clerkPubKey,
  ClerkQueryClientCacheInvalidator,
  LogoutButton,
  PublicHome,
  SignInPage,
  SignUpPage,
  stripBase,
} from './auth';

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
      [team.name, team.mainMentor.name, ...team.students.map((student) => student.name)]
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
  const studentCount = teams.data?.reduce((total, team) => total + team.students.length, 0) ?? 0;
  const accessDenied = teams.error?.status === 403;

  const refreshAll = () => {
    void healthCheck.refetch();
    void health.refetch();
    void teams.refetch();
  };

  return (
    <div className="grain min-h-[100dvh] w-full bg-background text-foreground">
      <header className="border-b border-border/70 bg-card/70">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-8 sm:py-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Waypoints size={19} />
            </span>
            <span className="min-w-0 font-display text-lg leading-tight sm:text-xl">HUB de Mentorias PIBEP PUCPR</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
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
            <LogoutButton />
          </div>
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
            Relação oficial de equipes, mentores e estudantes do PIBEP 2026 · 16ª edição.
          </p>
        </div>

        <section>
            <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <div className="mb-2 font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">
                  PIBEP 2026 · 16ª edição
                </div>
                <h2 className="font-display text-2xl tracking-[-0.035em]">
                  {teams.isLoading
                    ? 'Carregando equipes…'
                    : teams.isError
                      ? accessDenied ? 'Acesso pendente' : 'Equipes indisponíveis'
                      : `${teams.data?.length ?? 0} equipes · ${studentCount} estudantes`}
                </h2>
              </div>
              <label className="relative block w-full sm:w-[242px]">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={15}
                />
                <input
                  className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-xs text-foreground outline-none transition-shadow placeholder:text-muted-foreground/75 focus:ring-2 focus:ring-primary/20"
                  aria-label="Buscar equipe, mentor ou estudante"
                  data-testid="input-buscar-equipes"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar equipe, mentor ou estudante"
                  type="search"
                  value={search}
                />
              </label>
            </div>

            {teams.isLoading ? (
              <TeamSkeletonGrid />
            ) : teams.isError ? (
              accessDenied ? <AccessDeniedState /> : <ErrorState onRetry={refreshAll} />
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
    mainMentor: {
      name: string;
    };
    students: { id: number; name: string; sortOrder: number }[];
  };
  index: number;
}) {
  return (
    <article
      className={`animate-rise-in delay-${Math.min(index + 3, 5)} group rounded-2xl border border-border bg-card p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-27px_hsl(184_26%_17%_/_0.6)]`}
      data-testid={`card-equipe-${team.id}`}
    >
      <div className="flex items-start gap-3 border-b border-border/70 pb-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Waypoints size={17} />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-[25px] tracking-[-0.04em]" data-testid={`text-equipe-${team.id}`}>
            {team.name}
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground" data-testid={`text-mentor-${team.id}`}>
            Mentor responsável: <span className="font-semibold text-foreground">{team.mainMentor.name}</span>
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <UsersRound size={13} />
          Estudantes ({team.students.length})
        </div>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-5 text-foreground/85" data-testid={`lista-estudantes-${team.id}`}>
          {team.students.map((student) => (
            <li key={student.id}>{student.name}</li>
          ))}
        </ul>
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

function AccessDeniedState() {
  return (
    <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center" data-testid="state-acesso-pendente">
      <CircleAlert className="mx-auto mb-4 text-primary" size={25} />
      <h3 className="font-display text-2xl tracking-[-0.03em]">Acesso ainda não aprovado</h3>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
        Peça ao responsável pelo Hub para incluir seu e-mail entre os autorizados.
        Criar uma conta não libera a relação automaticamente.
      </p>
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
         {hasSearch ? 'Tente outro nome de equipe, mentor ou estudante.' : 'Quando houver equipes, elas aparecerão aqui.'}
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
        <Route path="/" component={HomeRedirect} />
        <Route path="/user-portal" component={UserPortal} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/user-portal" /></Show>
      <Show when="signed-out"><PublicHome /></Show>
    </>
  );
}

function UserPortal() {
  return (
    <>
      <Show when="signed-in"><Home /></Show>
      <Show when="signed-out"><Redirect to="/" /></Show>
    </>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/user-portal`}
      signUpFallbackRedirectUrl={`${basePath}/user-portal`}
      localization={ptBR}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
