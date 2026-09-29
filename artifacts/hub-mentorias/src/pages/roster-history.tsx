import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetRosterAuditQueryKey, useGetRosterAudit } from '@workspace/api-client-react';
import type { Team } from '@workspace/api-client-react';

const fieldClass = 'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground';

function describeHistoryFilters(filters: { teamId?: number; studentId?: number }) {
  const parts = [
    ...(filters.teamId !== undefined ? [`equipe #${filters.teamId}`] : []),
    ...(filters.studentId !== undefined ? [`estudante #${filters.studentId}`] : []),
  ];
  return parts.length ? parts.join(' e ') : 'sem filtros';
}

export function RosterHistory({ team }: { team?: Team }) {
  const queryClient = useQueryClient();
  const [teamFilter, setTeamFilter] = useState('');
  const [studentFilter, setStudentFilter] = useState('');
  const valid = (value: string) => !value || (/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647);
  const filtersValid = valid(teamFilter) && valid(studentFilter);
  const filters = {
    ...(teamFilter ? { teamId: Number(teamFilter) } : {}),
    ...(studentFilter ? { studentId: Number(studentFilter) } : {}),
  };
  const history = useGetRosterAudit(filters, {
    query: { queryKey: getGetRosterAuditQueryKey(filters), enabled: filtersValid, staleTime: 0, refetchOnMount: 'always' },
  });
  type HistoryData = NonNullable<typeof history.data>;
  const [lastSuccessfulHistory, setLastSuccessfulHistory] = useState<{
    data: HistoryData;
    filters: typeof filters;
  } | null>(null);

  useEffect(() => {
    if (!filtersValid || history.data === undefined) return;
    setLastSuccessfulHistory({
      data: history.data,
      filters: {
        ...(teamFilter ? { teamId: Number(teamFilter) } : {}),
        ...(studentFilter ? { studentId: Number(studentFilter) } : {}),
      },
    });
  }, [filtersValid, history.data, teamFilter, studentFilter]);

  const visibleHistory = history.data === undefined
    ? lastSuccessfulHistory
    : { data: history.data, filters };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 sm:p-7" data-testid="historico-relacao">
      <h2 className="font-display text-2xl tracking-[-0.035em]">Histórico de alterações</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Até 100 registros recentes. Filtre por ID para consultar também equipes ou estudantes já excluídos. Nomes de estudantes não são guardados aqui.</p>
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="w-36 text-xs font-semibold">ID da equipe
          <input type="number" min="1" step="1" className={`${fieldClass} mt-1`} value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} data-testid="filtro-historico-equipe" />
        </label>
        <label className="w-36 text-xs font-semibold">ID do estudante
          <input type="number" min="1" step="1" className={`${fieldClass} mt-1`} value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)} data-testid="filtro-historico-estudante" />
        </label>
        {team && <button type="button" className="min-h-10 rounded-lg border border-border px-3 text-xs font-semibold" onClick={() => { setTeamFilter(String(team.id)); setStudentFilter(''); }}>Histórico da equipe selecionada</button>}
        <button type="button" className="min-h-10 rounded-lg border border-border px-3 text-xs font-semibold" onClick={() => { setTeamFilter(''); setStudentFilter(''); }}>Ver todos</button>
      </div>
      {team && team.students.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Estudante:</span>
        {team.students.map((student) => <button key={student.id} type="button" className="inline-flex min-h-10 items-center rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted" onClick={() => { setTeamFilter(String(team.id)); setStudentFilter(String(student.id)); }}>{student.name} (#{student.id})</button>)}
      </div>}
      {!filtersValid ? <p role="alert" className="mt-5 text-xs text-destructive">Informe IDs inteiros positivos.</p> : <>
        {history.isError ?
          <div role="alert" className="mt-5 text-xs text-destructive">
            {visibleHistory
              ? `Não foi possível atualizar o histórico. Exibindo os últimos dados carregados para ${describeHistoryFilters(visibleHistory.filters)}.`
              : 'Não foi possível consultar o histórico.'}
            {' '}
            <button type="button" className="inline-flex min-h-10 items-center underline" onClick={() => void queryClient.refetchQueries({ queryKey: getGetRosterAuditQueryKey(filters), exact: true })}>Tentar novamente</button>
          </div> :
          !visibleHistory && history.isLoading ?
            <p className="mt-5 text-xs text-muted-foreground">Carregando histórico…</p> :
          visibleHistory && history.isFetching ?
            <p role="status" className="mt-5 text-xs text-muted-foreground">
              Atualizando histórico. Os resultados da última consulta ({describeHistoryFilters(visibleHistory.filters)}) continuam visíveis.
            </p> :
            null}
        {visibleHistory?.data.length ? <ol className="mt-5 divide-y divide-border/70" data-testid="lista-historico">
          {visibleHistory.data.map((event) => <li key={event.id} className="py-3 text-xs leading-5">
            <div className="font-semibold">{event.summary}</div>
            <div className="mt-1 break-words text-muted-foreground">
              Equipe #{event.teamId}{event.studentId !== null ? ` · Estudante #${event.studentId}` : ''} · {new Date(event.createdAt).toLocaleString('pt-BR')} · {event.actorEmail}
            </div>
          </li>)}
        </ol> : visibleHistory ? <p className="mt-5 text-xs text-muted-foreground" data-testid="historico-vazio">
          {history.isError || history.isFetching
            ? `Nenhuma alteração registrada na última consulta (${describeHistoryFilters(visibleHistory.filters)}).`
            : 'Nenhuma alteração registrada para este filtro.'}
        </p> : null}
      </>}
      <button type="button" className="mt-4 inline-flex min-h-10 items-center text-xs font-semibold text-primary underline" onClick={() => void queryClient.invalidateQueries({ queryKey: getGetRosterAuditQueryKey() })}>Atualizar histórico</button>
    </section>
  );
}