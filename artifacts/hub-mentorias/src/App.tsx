import { useMemo, useState, type ReactNode } from 'react';
import { ClerkProvider, Show } from '@clerk/react';
import { ptBR } from '@clerk/localizations';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  CheckCircle2,
  CircleAlert,
  Layers,
  Plus,
  Settings2,
  RefreshCw,
  Search,
  UsersRound,
} from 'lucide-react';
import {
  getGetAccessPermissionsQueryKey,
  getGetDashboardStatsQueryKey,
  getGetHealthQueryKey,
  getGetTeamsQueryKey,
  getHealthCheckQueryKey,
  useGetHealth,
  useGetAccessPermissions,
  useGetDashboardStats,
  useGetTeams,
  useHealthCheck,
} from '@workspace/api-client-react';
import ManagePage from '@/pages/manage';
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
  PublicHome,
  SignInPage,
  SignUpPage,
  stripBase,
  UserProfileButton,
} from './auth';
import { DashboardKpis } from '@/components/dashboard-kpis';
import { TeamsExecutiveTable, TeamsTableSkeleton } from '@/components/teams-executive-table';

const queryClient = new QueryClient();

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\u2018\u2019\u201b\u02bc\uff07]/gu, "'")
    .replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/gu, '-')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

export function Home() {
  const [search, setSearch] = useState('');
  const access = useGetAccessPermissions({
    query: {
      queryKey: getGetAccessPermissionsQueryKey(),
      staleTime: 0,
      refetchOnMount: 'always',
    },
  });
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
  const dashboardStats = useGetDashboardStats({
    query: {
      queryKey: getGetDashboardStatsQueryKey(),
      staleTime: 30_000,
    },
  });

  const filteredTeams = useMemo(() => {
    const source = teams.data ?? [];
    const normalizedSearch = normalizeSearchText(search.trim());
    if (!normalizedSearch) return source;
    return source.filter((team) =>
      [team.name, team.mainMentor.name, ...team.students.map((student) => student.name)].some(
        (name) => normalizeSearchText(name).includes(normalizedSearch),
      ),
    );
  }, [search, teams.data]);

  const apiAvailable = healthCheck.data?.status === 'ok';
  const connected =
    apiAvailable &&
    health.data?.status === 'ok' &&
    health.data.database === 'connected';
  const accessDenied = teams.error?.status === 403;

  const refreshAll = () => {
    void healthCheck.refetch();
    void health.refetch();
    void teams.refetch();
    void access.refetch();
    void dashboardStats.refetch();
  };

  return (
    <div className="grain min-h-[100dvh] w-full bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="font-inter mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
              <Layers size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight text-zinc-900">Hub de Mentorias</span>
              <span className="mt-1 block text-xs text-zinc-500">Ciclo Ativo • 8 Equipes</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!access.isError && access.data?.canManage === true && (
              <Link href="/manage" className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100" data-testid="link-manter-equipes">
                <Settings2 size={14} /> <span>Manter equipes</span>
              </Link>
            )}
            <button
              className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
              data-testid="button-atualizar"
              onClick={refreshAll}
              type="button"
            >
              <RefreshCw
                className={health.isFetching || teams.isFetching || dashboardStats.isFetching ? 'animate-spin' : ''}
                size={14}
              />
              Atualizar
            </button>
            <button
              aria-label="Novo registro, disponível em uma próxima etapa"
              className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:cursor-default disabled:opacity-100"
              data-testid="button-novo-registro"
              disabled
              type="button"
            >
              <Plus size={14} /> Novo Registro
            </button>
            <UserProfileButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-5 pb-12 pt-10 sm:px-8">
        <h1 className="sr-only">Painel de mentorias do PIBEP 2026</h1>
        <DashboardKpis
          data={dashboardStats.data}
          isError={dashboardStats.isError}
          isLoading={dashboardStats.isLoading}
          onRetry={() => void dashboardStats.refetch()}
        />

        <section aria-labelledby="heading-equipes" className="font-inter">
          <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2
                className="text-base font-semibold text-zinc-900"
                data-testid="text-equipes-heading"
                id="heading-equipes"
              >
                Equipes em Acompanhamento
              </h2>
              <p className="mt-1 text-xs text-zinc-500" data-testid="text-equipes-count">
                {teams.isLoading
                  ? 'Carregando startups…'
                  : teams.isError
                    ? 'A lista de equipes está indisponível'
                    : `${teams.data?.length ?? 0} startups ativas no ciclo`}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div
                className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-semibold ${
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
              <label className="relative block w-full sm:w-[242px]">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  size={15}
                />
                <input
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-xs text-zinc-800 outline-none transition-shadow placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900/10"
                  aria-label="Buscar equipe, mentor ou estudante"
                  data-testid="input-buscar-equipes"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar equipe, mentor ou estudante"
                  type="search"
                  value={search}
                />
              </label>
            </div>
          </div>

          {teams.isLoading ? (
            <TeamsTableSkeleton />
          ) : teams.isError ? (
            accessDenied ? <AccessDeniedState /> : <ErrorState onRetry={refreshAll} />
          ) : filteredTeams.length === 0 ? (
            <EmptyState hasSearch={Boolean(search)} onClear={() => setSearch('')} />
          ) : (
            <TeamsExecutiveTable teams={filteredTeams} />
          )}
        </section>
      </main>
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
        <Route path="/manage" component={ManageRoute} />
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

function ManageRoute() {
  return (
    <>
      <Show when="signed-in"><ManagePage /></Show>
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
