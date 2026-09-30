import type { MentorOption } from '@workspace/api-client-react';

type MentorsTableProps = {
  mentors: MentorOption[];
};

const columns = [
  'Mentor',
  'E-mail',
  'Especialidade',
  'Tipo',
  'Sessões realizadas',
  'NPS recebido',
  'Equipes acompanhadas',
];

export function MentorsTableSkeleton() {
  return (
    <div
      aria-label="Carregando mentores"
      className="overflow-hidden rounded-2xl border border-border bg-card p-3"
      data-testid="loading-mentores"
      role="status"
    >
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div aria-hidden="true" className="h-12 animate-pulse rounded bg-muted" key={index} />
        ))}
      </div>
    </div>
  );
}

export function MentorsTable({ mentors }: MentorsTableProps) {
  return (
    <div
      className="max-w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      data-testid="table-mentores"
    >
      <div className="max-w-full touch-pan-x overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[850px] table-fixed text-left text-xs text-foreground">
          <caption className="sr-only">Indicadores consolidados de desempenho dos mentores</caption>
          <thead className="bg-muted/70 text-[11px] font-semibold text-muted-foreground">
            <tr>
              {columns.map((column, index) => (
                <th
                  className="px-3 py-3"
                  key={column}
                  scope="col"
                  style={{ width: ['20%', '19%', '18%', '10%', '12%', '10%', '11%'][index] }}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {mentors.map((mentor) => (
              <tr
                className="transition-colors hover:bg-muted/50"
                data-testid={`row-mentor-${mentor.id}`}
                key={mentor.id}
              >
                <td className="px-3 py-3.5 align-middle">
                  <p className="truncate font-medium text-foreground" title={mentor.name}>
                    {mentor.name}
                  </p>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  {mentor.email ? (
                    <a
                      className="block truncate text-muted-foreground hover:text-foreground hover:underline"
                      href={`mailto:${mentor.email}`}
                      title={mentor.email}
                    >
                      {mentor.email}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Não informado</span>
                  )}
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <span className="block truncate text-muted-foreground" title={mentor.expertiseArea ?? undefined}>
                    {mentor.expertiseArea || 'Não informada'}
                  </span>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <span className="inline-flex rounded-full border border-border bg-secondary px-2 py-1 text-[10px] font-medium text-secondary-foreground">
                    {mentor.mentorType === 'interno'
                      ? 'Interno'
                      : mentor.mentorType === 'externo'
                        ? 'Externo'
                        : 'Não informado'}
                  </span>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <span className="font-semibold tabular-nums text-foreground" data-testid={`text-sessoes-mentor-${mentor.id}`}>
                    {mentor.totalSessions} {mentor.totalSessions === 1 ? 'sessão' : 'sessões'}
                  </span>
                </td>
                <td className="px-3 py-3.5 align-middle">
                  {mentor.avgNpsReceived === null ? (
                    <span className="text-muted-foreground">Sem avaliações</span>
                  ) : (
                    <span className="font-semibold tabular-nums text-foreground" data-testid={`text-nps-mentor-${mentor.id}`}>
                      {mentor.avgNpsReceived.toLocaleString('pt-BR', {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                      <span className="ml-1 font-normal text-muted-foreground">/ 10</span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-3.5 align-middle">
                  <span className="font-semibold tabular-nums text-foreground" data-testid={`text-equipes-mentor-${mentor.id}`}>
                    {mentor.assignedTeamsCount}{' '}
                    {mentor.assignedTeamsCount === 1 ? 'equipe' : 'equipes'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}