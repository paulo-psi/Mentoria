import { useRef, useState } from 'react';
import type { Team } from '@workspace/api-client-react';
import { Calendar, ChevronRight, FileText, Share2 } from 'lucide-react';
import { TeamDossierDrawer } from '@/components/team-dossier-drawer';
import { HorizontalTableViewport } from '@/components/horizontal-table-viewport';

type TeamsExecutiveTableProps = {
  teams: Team[];
};

const columns = [
  'Equipe & Proposta',
  'Estágio',
  'Mentor Principal',
  'Sessões Realizadas',
  'Última Avaliação',
  'Próximo Passo Acordado',
  'Ação',
];

export function TeamsTableSkeleton() {
  return (
    <div
      aria-label="Carregando equipes"
      className="overflow-hidden rounded-2xl border border-border bg-card p-3"
      data-testid="loading-equipes"
      role="status"
    >
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            aria-hidden="true"
            className="h-12 animate-pulse rounded bg-muted"
            key={index}
          />
        ))}
      </div>
    </div>
  );
}

export function TeamsExecutiveTable({ teams }: TeamsExecutiveTableProps) {
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [dossierOpen, setDossierOpen] = useState(false);
  const dossierTriggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
    <div
      className="max-w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      data-testid="table-executive-teams"
    >
      <HorizontalTableViewport tableLabel="Tabela de equipes" testId="table-executive-teams">
        <table className="w-full min-w-[1040px] table-fixed text-left text-xs text-foreground">
          <thead className="bg-muted/70 text-[11px] font-semibold text-muted-foreground">
            <tr>
              {columns.map((column, index) => (
                <th
                  className={index === 0
                    ? 'sticky left-0 z-20 border-r border-border/70 bg-muted px-3 py-3'
                    : 'px-3 py-3'}
                  key={column}
                  scope="col"
                  style={{ width: ['22%', '12%', '18%', '13%', '12%', '15%', '8%'][index] }}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {teams.map((team) => (
              <tr
                className="group transition-colors hover:bg-muted/50"
                data-testid={`row-equipe-${team.id}`}
                key={team.id}
              >
                <td className="sticky left-0 z-10 border-r border-border/70 bg-card px-3 py-3.5 align-middle transition-colors group-hover:bg-muted/50">
                  <p
                    className="break-words font-medium text-foreground"
                    data-testid={`text-equipe-${team.id}`}
                    title={team.name}
                  >
                    {team.name}
                  </p>
                  <p
                    className="mt-1 truncate text-[11px] text-muted-foreground"
                    data-testid={`text-proposta-${team.id}`}
                    title={team.pitchSummary ?? 'Resumo ainda não informado'}
                  >
                    {team.pitchSummary || 'Resumo ainda não informado'}
                  </p>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <span
                    className="inline-flex max-w-full truncate rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] text-secondary-foreground"
                    data-testid={`text-estagio-${team.id}`}
                    title={team.currentStage ?? 'Estágio não definido'}
                  >
                    {team.currentStage || 'Estágio não definido'}
                  </span>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <p
                    className="truncate font-medium text-foreground"
                    data-testid={`text-mentor-${team.id}`}
                    title={team.mainMentor.name}
                  >
                    {team.mainMentor.name}
                  </p>
                  <p
                    className="mt-1 truncate text-[11px] text-muted-foreground"
                    title={team.mainMentor.expertiseArea ?? 'Especialidade não informada'}
                  >
                    {team.mainMentor.expertiseArea || 'Especialidade não informada'}
                  </p>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <p className="font-semibold tabular-nums text-foreground" data-testid={`text-sessoes-${team.id}`}>
                    {team.totalSessions} {team.totalSessions === 1 ? 'sessão' : 'sessões'}
                  </p>
                  {team.transversalSessionCount > 0 && (
                    <span
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                      data-testid={`text-sessoes-transversais-${team.id}`}
                      title="Inclui sessões com mentores transversais ou externos"
                    >
                      <Share2 aria-hidden="true" size={11} />
                      {team.transversalSessionCount} transversal/externa
                    </span>
                  )}
                </td>
                <td className="px-3 py-3.5 align-middle">
                  {team.lastSessionScore === null ? (
                    <span className="text-muted-foreground">Sem avaliação</span>
                  ) : (
                    <>
                      <p
                        className="font-semibold tabular-nums text-foreground"
                        data-testid={`text-ultima-avaliacao-${team.id}`}
                      >
                        {team.lastSessionScore}/10
                      </p>
                      {team.lastSessionDate && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Calendar aria-hidden="true" size={11} />
                          {formatCalendarDate(team.lastSessionDate)}
                        </p>
                      )}
                    </>
                  )}
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <p
                    className="truncate text-muted-foreground"
                    data-testid={`text-proximo-passo-${team.id}`}
                    title={team.latestAgreedNextSteps ?? 'Nenhum próximo passo registrado'}
                  >
                    {team.latestAgreedNextSteps || 'Nenhum próximo passo registrado'}
                  </p>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <button
                    aria-label={`Ver dossiê de ${team.name}`}
                    className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    data-testid={`button-ver-dossie-${team.id}`}
                    onClick={(event) => {
                      dossierTriggerRef.current = event.currentTarget;
                      setSelectedTeam(team);
                      setDossierOpen(true);
                    }}
                    type="button"
                  >
                    <FileText aria-hidden="true" size={13} />
                    Ver Dossiê
                    <ChevronRight aria-hidden="true" size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </HorizontalTableViewport>
    </div>
    {selectedTeam && (
      <TeamDossierDrawer
        team={selectedTeam}
        open={dossierOpen}
        onOpenChange={setDossierOpen}
        onRestoreFocus={() => dossierTriggerRef.current?.focus()}
        onClosed={() => setSelectedTeam(null)}
      />
    )}
    </>
  );
}

function formatCalendarDate(date: string) {
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return `${day}/${month}/${year}`;
}