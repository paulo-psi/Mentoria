import type { DashboardStats } from '@workspace/api-client-react';
import {
  CalendarCheck,
  RefreshCw,
  Share2,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

type DashboardKpisProps = {
  data?: DashboardStats;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
};

type MetricCardProps = {
  id: string;
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
};

export function DashboardKpis({ data, isError, isLoading, onRetry }: DashboardKpisProps) {
  return (
    <section aria-labelledby="dashboard-kpis-heading" className="font-inter mb-10">
      <h2
        className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400"
        data-testid="text-dashboard-kpis-heading"
        id="dashboard-kpis-heading"
      >
        Visão Geral do Ciclo
      </h2>

      {isLoading ? (
        <div
          aria-label="Carregando métricas do ciclo"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="loading-kpis"
          role="status"
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              aria-hidden="true"
              className="h-28 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100"
              key={index}
            />
          ))}
        </div>
      ) : isError || !data ? (
        <div
          className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          data-testid="state-kpis-erro"
          role="alert"
        >
          <div>
            <p className="text-sm font-semibold text-zinc-800">
              Métricas temporariamente indisponíveis.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Tente atualizar a leitura do ciclo em instantes.
            </p>
          </div>
          <button
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            data-testid="button-tentar-novamente-kpis"
            onClick={onRetry}
            type="button"
          >
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="grid-kpis">
          <MetricCard
            detail="registros no ciclo"
            icon={CalendarCheck}
            id="sessions"
            label="Sessões Realizadas"
            value={new Intl.NumberFormat('pt-BR').format(data.totalSessions)}
          />
          <MetricCard
            detail="/ 10"
            icon={Sparkles}
            id="nps"
            label="NPS das Mentorias"
            value={data.avgNps.toFixed(1)}
          />
          <MetricCard
            detail="/ 10"
            icon={TrendingUp}
            id="traction"
            label="Tração das Equipes"
            value={data.avgTraction.toFixed(1)}
          />
          <MetricCard
            detail="transversais / externas"
            icon={Share2}
            id="network-openness"
            label="Abertura de Rede"
            value={`${data.networkOpennessRate.toFixed(1)}%`}
          />
        </div>
      )}
    </section>
  );
}

function MetricCard({ id, label, value, detail, icon: Icon }: MetricCardProps) {
  return (
    <article
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
      data-testid={`card-kpi-${id}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-zinc-500">{label}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
          <Icon aria-hidden="true" size={16} />
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <p className="text-2xl font-bold tracking-tight text-zinc-900" data-testid={`value-kpi-${id}`}>
          {value}
        </p>
        <span className="text-xs text-zinc-400">{detail === '/ 10' ? detail : ''}</span>
      </div>
      {detail !== '/ 10' && <p className="mt-1 text-xs text-zinc-500">{detail}</p>}
    </article>
  );
}