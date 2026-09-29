import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarPlus, Check, ChevronDown, RefreshCw, UsersRound } from 'lucide-react';
import {
  getGetDashboardStatsQueryKey,
  getGetMentorsQueryKey,
  getGetTeamSessionsQueryKey,
  getGetTeamsQueryKey,
  useGetMentors,
  type Team,
} from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SessionRegistrationForm } from '@/components/session-registration-form';
import { useToast } from '@/hooks/use-toast';

type SessionRegistrationModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: Team[];
};

export function SessionRegistrationModal({ open, onOpenChange, teams }: SessionRegistrationModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const mentors = useGetMentors({
    query: {
      enabled: open,
      queryKey: getGetMentorsQueryKey(),
      staleTime: 30_000,
    },
  });

  const selectedTeam = useMemo(
    () => teams.find((team) => String(team.id) === selectedTeamId) ?? teams[0],
    [selectedTeamId, teams],
  );
  const principalMentorIsAvailable = selectedTeam
    ? (mentors.data ?? []).some((mentor) => mentor.id === selectedTeam.mainMentor.id)
    : false;

  useEffect(() => {
    if (!open) return;
    if (!selectedTeamId || !teams.some((team) => String(team.id) === selectedTeamId)) {
      setSelectedTeamId(teams[0] ? String(teams[0].id) : '');
    }
  }, [open, selectedTeamId, teams]);

  const handleSaved = async () => {
    if (!selectedTeam) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetTeamsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetTeamSessionsQueryKey(selectedTeam.id) }),
    ]);
    toast({
      title: 'Sessão registrada',
      description: `O histórico de ${selectedTeam.name} foi atualizado.`,
    });
    onOpenChange(false);
    setSelectedTeamId('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSelectedTeamId('');
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] max-w-3xl gap-0 overflow-hidden border-zinc-200 bg-zinc-50 p-0 text-zinc-900 shadow-2xl rounded-xl sm:w-full sm:max-h-[calc(100dvh-3rem)] sm:rounded-2xl"
        data-testid="modal-novo-registro"
      >
        <DialogHeader className="shrink-0 border-b border-zinc-200 bg-white px-4 pb-4 pt-5 text-left sm:px-7 sm:pb-5 sm:pt-6">
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white">
              <CalendarPlus aria-hidden="true" size={18} />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold tracking-[-0.025em] text-zinc-950">Novo registro de mentoria</DialogTitle>
              <DialogDescription className="mt-1.5 max-w-xl text-xs leading-5 text-zinc-500">
                Registre o encontro da semana com contexto, notas e compromissos claros para a próxima leitura.
              </DialogDescription>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-600">Passo 4.1</span>
            <span>Registro semanal</span>
          </div>
        </DialogHeader>

        <div className="min-h-0 max-h-[calc(100dvh-11rem)] overflow-y-auto px-4 py-4 sm:px-7 sm:py-6" data-testid="scroll-novo-registro">
          {!teams.length ? (
            <EmptyTeamsState />
          ) : (
            <>
              {mentors.isLoading ? (
                <MentorLoadingState />
              ) : mentors.isError ? (
                <MentorErrorState onRetry={() => void mentors.refetch()} />
              ) : mentors.data?.length === 0 ? (
                <MentorEmptyState />
              ) : selectedTeam ? (
                <SessionRegistrationForm
                  defaultMentorId={principalMentorIsAvailable ? selectedTeam.mainMentor.id : undefined}
                  contextContent={
                    <div className="mb-5 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5">
                      <div className="mb-3 flex items-start gap-3">
                        <UsersRound aria-hidden="true" className="mt-0.5 text-zinc-500" size={16} />
                        <div>
                          <label className="text-xs font-semibold text-zinc-800" htmlFor="registro-team">
                            Equipe
                          </label>
                          <p className="mt-1 text-xs leading-5 text-zinc-500">Selecione a startup que recebeu a mentoria.</p>
                        </div>
                      </div>
                      <div className="relative">
                        <select
                          className="h-11 w-full appearance-none rounded-lg border border-zinc-200 bg-white px-3 pr-10 text-sm font-medium text-zinc-900 outline-none transition-colors focus:border-zinc-500 focus:ring-2 focus:ring-zinc-900/10"
                          data-testid="select-equipe-registro"
                          id="registro-team"
                          onChange={(event) => setSelectedTeamId(event.target.value)}
                          value={selectedTeam ? String(selectedTeam.id) : ''}
                        >
                          {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                      </div>
                      {principalMentorIsAvailable && (
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-500" data-testid="status-mentor-sugerido">
                          <Check aria-hidden="true" className="text-zinc-700" size={13} />
                          Mentor principal sugerido automaticamente
                        </p>
                      )}
                    </div>
                  }
                  key={selectedTeam.id}
                  mentors={mentors.data ?? []}
                  onSaved={handleSaved}
                  onCancel={() => handleOpenChange(false)}
                  team={selectedTeam}
                  testIdSuffix="registro"
                />
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmptyTeamsState() {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center" data-testid="state-sem-equipes-registro">
      <UsersRound aria-hidden="true" className="mb-4 text-zinc-400" size={24} />
      <h3 className="text-sm font-semibold text-zinc-800">Nenhuma equipe disponível</h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-zinc-500">A relação de equipes precisa estar carregada antes de registrar uma mentoria.</p>
    </div>
  );
}

function MentorLoadingState() {
  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4" data-testid="loading-mentores-registro" role="status" aria-label="Carregando mentores oficiais">
      <div className="h-3 w-32 animate-pulse rounded bg-zinc-100" />
      <div className="h-11 w-full animate-pulse rounded-lg bg-zinc-100" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-11 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-11 animate-pulse rounded-lg bg-zinc-100" />
      </div>
    </div>
  );
}

function MentorErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-4" data-testid="state-erro-mentores-registro" role="alert">
      <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0 text-zinc-500" size={17} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-800">Os mentores oficiais não carregaram.</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">Atualize a lista para continuar o registro com segurança.</p>
      </div>
      <button
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/15"
        data-testid="button-tentar-mentores-registro"
        onClick={onRetry}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={13} />
        Tentar novamente
      </button>
    </div>
  );
}

function MentorEmptyState() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-xs leading-5 text-amber-900" data-testid="state-vazio-mentores-registro" role="status">
      Não há mentores oficiais disponíveis para registrar uma sessão. Solicite a atualização da relação antes de continuar.
    </div>
  );
}