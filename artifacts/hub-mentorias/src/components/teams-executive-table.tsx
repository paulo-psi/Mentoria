import { useRef, useState } from 'react';
import type { Team } from '@workspace/api-client-react';
import { Calendar, ChevronRight, FileText, Share2 } from 'lucide-react';
import { TeamDossierDrawer } from '@/components/team-dossier-drawer';

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
      className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-3"
      data-testid="loading-equipes"
      role="status"
    >
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            aria-hidden="true"
            className="h-12 animate-pulse rounded bg-zinc-100"
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
      className="max-w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
      data-testid="table-executive-teams"
    >
      <div className="max-w-full touch-pan-x overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[1040px] table-fixed text-left font-inter text-xs">
          <thead className="bg-zinc-50 text-[11px] font-semibold text-zinc-500">
            <tr>
              {columns.map((column, index) => (
                <th
                  className="px-3 py-3"
                  key={column}
                  scope="col"
                  style={{ width: ['22%', '12%', '18%', '13%', '12%', '15%', '8%'][index] }}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {teams.map((team) => (
              <tr
                className="transition-colors hover:bg-zinc-50/70"
                data-testid={`row-equipe-${team.id}`}
                key={team.id}
              >
                <td className="px-3 py-3.5 align-middle">
                  <p
                    className="truncate font-medium text-zinc-900"
                    data-testid={`text-equipe-${team.id}`}
                    title={team.name}
                  >
                    {team.name}
                  </p>
                  <p
                    className="mt-1 truncate text-[11px] text-zinc-500"
                    data-testid={`text-proposta-${team.id}`}
                    title={team.pitchSummary ?? 'Resumo ainda não informado'}
                  >
                    {team.pitchSummary || 'Resumo ainda não informado'}
                  </p>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <span
                    className="inline-flex max-w-full truncate rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-700"
                    data-testid={`text-estagio-${team.id}`}
                    title={team.currentStage ?? 'Estágio não definido'}
                  >
                    {team.currentStage || 'Estágio não definido'}
                  </span>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <p
                    className="truncate font-medium text-zinc-800"
                    data-testid={`text-mentor-${team.id}`}
                    title={team.mainMentor.name}
                  >
                    {team.mainMentor.name}
                  </p>
                  <p
                    className="mt-1 truncate text-[11px] text-zinc-500"
                    title={team.mainMentor.expertiseArea ?? 'Especialidade não informada'}
                  >
                    {team.mainMentor.expertiseArea || 'Especialidade não informada'}
                  </p>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <p className="font-semibold tabular-nums text-zinc-800" data-testid={`text-sessoes-${team.id}`}>
                    {team.totalSessions} {team.totalSessions === 1 ? 'sessão' : 'sessões'}
                  </p>
                  {team.transversalSessionCount > 0 && (
                    <span
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-zinc-500"
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
                    <span className="text-zinc-400">Sem avaliação</span>
                  ) : (
                    <>
                      <p
                        className="font-semibold tabular-nums text-zinc-800"
                        data-testid={`text-ultima-avaliacao-${team.id}`}
                      >
                        {team.lastSessionScore}/10
                      </p>
                      {team.lastSessionDate && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-zinc-500">
                          <Calendar aria-hidden="true" size={11} />
                          {formatCalendarDate(team.lastSessionDate)}
                        </p>
                      )}
                    </>
                  )}
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <p
                    className="truncate text-zinc-600"
                    data-testid={`text-proximo-passo-${team.id}`}
                    title={team.latestAgreedNextSteps ?? 'Nenhum próximo passo registrado'}
                  >
                    {team.latestAgreedNextSteps || 'Nenhum próximo passo registrado'}
                  </p>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <button
                    aria-label={`Ver dossiê de ${team.name}`}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1.5 text-[11px] text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
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
      </div>
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