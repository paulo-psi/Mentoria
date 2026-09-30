import {
  AlertCircle,
  CalendarDays,
  ClipboardList,
  FileText,
  RefreshCw,
  UserRound,
  X,
} from 'lucide-react';
import {
  getGetTeamSessionsQueryKey,
  useGetTeamSessions,
  type Team,
  type TeamSessionHistoryItem,
} from '@workspace/api-client-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

type TeamDossierDrawerProps = {
  team: Team;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestoreFocus: () => void;
  onClosed: () => void;
};

const sessionTypeLabels: Record<TeamSessionHistoryItem['sessionType'], string> = {
  principal: 'Principal',
  transversal: 'Transversal',
  externo: 'Externo',
};

const sessionTypeClasses: Record<TeamSessionHistoryItem['sessionType'], string> = {
  principal: 'border-zinc-200 bg-zinc-100 text-zinc-700',
  transversal: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  externo: 'border-amber-200 bg-amber-50 text-amber-800',
};

const scoreLabels = [
  ['teamNps', 'NPS da Equipe'],
  ['teamActionability', 'Acionabilidade'],
  ['mentorCommitment', 'Comprometimento do Time'],
  ['mentorTraction', 'Tração/Execução'],
] as const;

export function TeamDossierDrawer({
  team,
  open,
  onOpenChange,
  onRestoreFocus,
  onClosed,
}: TeamDossierDrawerProps) {
  const query = useGetTeamSessions(team.id, {
    query: {
      enabled: open,
      queryKey: getGetTeamSessionsQueryKey(team.id),
    },
  });

  const sessions = query.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby="team-dossier-description"
        aria-labelledby="team-dossier-title"
        className="w-full max-w-none gap-0 overflow-hidden border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl [&>button]:hidden sm:max-w-2xl lg:max-w-3xl"
        data-testid="drawer-dossie-equipe"
        overlayTestId="dossie-backdrop"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
          onClosed();
        }}
        side="right"
      >
        <SheetHeader className="shrink-0 border-b border-zinc-200 bg-white px-4 pb-5 pt-5 text-left sm:px-7 sm:pt-6">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0 pr-2">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                <FileText aria-hidden="true" size={13} />
                Diário de bordo
              </div>
              <SheetTitle
                className="break-words text-xl font-semibold tracking-[-0.025em] text-zinc-950 sm:text-2xl"
                data-testid="text-dossie-equipe"
                id="team-dossier-title"
              >
                {team.name}
              </SheetTitle>
              <SheetDescription
                className="mt-2 max-w-xl text-xs leading-5 text-zinc-500"
                data-testid="text-dossie-descricao"
                id="team-dossier-description"
              >
                Histórico completo das mentorias, avaliações e compromissos registrados para esta equipe.
              </SheetDescription>
            </div>
            <button
              aria-label={`Fechar dossiê de ${team.name}`}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/15"
              data-testid="button-fechar-dossie"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="badges-dossie-equipe">
            <span
              className="inline-flex max-w-full whitespace-normal break-words rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700"
              data-testid="badge-estagio-equipe"
            >
              {team.currentStage || 'Estágio não definido'}
            </span>
            <span
              className="inline-flex min-w-0 max-w-full items-center gap-1.5 whitespace-normal break-words rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-700"
              data-testid="badge-mentor-principal"
            >
              <UserRound aria-hidden="true" size={12} />
              Mentor principal: {team.mainMentor.name}
            </span>
          </div>
        </SheetHeader>

        <div
          aria-label={`Histórico de sessões de ${team.name}`}
          className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/70 px-4 py-5 sm:px-7 sm:py-6"
          data-testid="scroll-dossie-sessoes"
        >
          {query.isLoading ? (
            <DossierLoadingState />
          ) : query.isError ? (
            <DossierErrorState onRetry={() => void query.refetch()} />
          ) : sessions.length === 0 ? (
            <div
              className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center"
              data-testid="state-vazio-sessoes"
            >
              <ClipboardList aria-hidden="true" className="mb-4 text-zinc-500" size={24} />
              <p className="max-w-sm text-sm leading-6 text-zinc-600">
                Nenhuma mentoria registrada para esta equipe até o momento.
              </p>
            </div>
          ) : (
            <div className="space-y-5" data-testid="lista-sessoes">
              {sessions.map((session, index) => (
                <SessionRecord index={index} key={session.id} session={session} />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SessionRecord({ index, session }: { index: number; session: TeamSessionHistoryItem }) {
  return (
    <article
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
      data-testid={`sessao-mentoria-${session.id}`}
    >
      <div className="border-b border-zinc-100 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              aria-hidden="true"
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-500"
            >
              <CalendarDays size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900" data-testid={`text-data-sessao-${session.id}`}>
                {formatSessionDate(session.sessionDate)}
              </p>
              <p className="mt-1 break-words text-xs text-zinc-500" data-testid={`text-mentor-sessao-${session.id}`}>
                <span className="font-medium text-zinc-700">{session.mentor.name}</span>
                <span aria-hidden="true" className="mx-1.5 text-zinc-300">
                  /
                </span>
                {session.mentor.expertiseArea || 'Especialidade não informada'}
              </p>
            </div>
          </div>
          <span
            className={`inline-flex w-fit shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${sessionTypeClasses[session.sessionType]}`}
            data-testid={`badge-tipo-sessao-${session.id}`}
          >
            {sessionTypeLabels[session.sessionType]}
          </span>
        </div>
        <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          Registro {String(index + 1).padStart(2, '0')} · conduzido por {session.mentor.name}
        </p>
      </div>

      <div className="px-4 py-5 sm:px-5">
        <section aria-labelledby={`scores-heading-${session.id}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500"
              data-testid={`heading-notas-${session.id}`}
              id={`scores-heading-${session.id}`}
            >
              Notas da sessão
            </h3>
            <span className="font-mono-ui text-[10px] text-zinc-500">escala 0–10</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid={`grid-notas-${session.id}`}>
            {scoreLabels.map(([key, label]) => (
              <div
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3"
                data-testid={`nota-${session.id}-${key}`}
                key={key}
              >
                <p className="text-[10px] leading-4 text-zinc-500">{label}</p>
                <p className="mt-1 font-mono-ui text-xl font-medium tabular-nums text-zinc-900">
                  {session.scores[key]}
                  <span className="ml-1 text-xs text-zinc-500">/10</span>
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 space-y-5" data-testid={`textos-qualitativos-${session.id}`}>
          <QualitativeBlock
            label="Parecer do mentor"
            text={session.qualitative.mentorQualitativeAssessment}
            testId={`parecer-mentor-${session.id}`}
          />
          <QualitativeBlock
            label="Pontos fortes da equipe"
            text={session.qualitative.teamFeedbackStrongPoints}
            testId={`pontos-fortes-${session.id}`}
          />
          <QualitativeBlock
            label="Oportunidades de melhoria"
            text={session.qualitative.teamFeedbackImprovements}
            testId={`oportunidades-melhoria-${session.id}`}
          />
          <div
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4"
            data-testid={`proximos-passos-${session.id}`}
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Próximos passos acordados
            </p>
            <p className="break-words whitespace-pre-wrap text-sm leading-6 text-zinc-700">
              {session.qualitative.agreedNextSteps}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function QualitativeBlock({ label, text, testId }: { label: string; text: string; testId: string }) {
  return (
    <section className="border-l-2 border-zinc-200 pl-4" data-testid={testId}>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</h3>
      <p className="break-words whitespace-pre-wrap text-sm leading-6 text-zinc-700">{text}</p>
    </section>
  );
}

function DossierLoadingState() {
  return (
    <div className="space-y-5" data-testid="loading-sessoes" role="status" aria-label="Carregando histórico de mentorias">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          aria-hidden="true"
          className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5"
          data-testid={`skeleton-sessao-${index + 1}`}
          key={index}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-1 items-start gap-3">
              <div className="h-8 w-8 animate-pulse rounded-md bg-zinc-100" />
              <div className="w-full max-w-xs space-y-2">
                <div className="h-3 w-36 animate-pulse rounded bg-zinc-100" />
                <div className="h-2.5 w-52 animate-pulse rounded bg-zinc-100" />
              </div>
            </div>
            <div className="h-6 w-20 animate-pulse rounded-full bg-zinc-100" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((__, scoreIndex) => (
              <div className="h-20 animate-pulse rounded-lg bg-zinc-100" key={scoreIndex} />
            ))}
          </div>
          <div className="space-y-3">
            <div className="h-2.5 w-32 animate-pulse rounded bg-zinc-100" />
            <div className="h-12 w-full animate-pulse rounded bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DossierErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-4 text-zinc-700"
      data-testid="state-erro-sessoes"
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-zinc-500" size={17} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-800">Não foi possível carregar o histórico.</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          A consulta falhou. Tente novamente para recuperar os registros desta equipe.
        </p>
      </div>
      <button
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/15"
        data-testid="button-tentar-novamente-sessoes"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={13} />
        Tentar novamente
      </button>
    </div>
  );
}

function formatSessionDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return value;
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}