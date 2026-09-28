import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, CircleAlert, ClipboardList, LockKeyhole, Plus, RefreshCw, Trash2, UsersRound, Waypoints, X } from 'lucide-react';
import {
  getGetAccessPermissionsQueryKey,
  getGetMentorsQueryKey,
  getGetRosterAuditQueryKey,
  getGetTeamsQueryKey,
  useCreateStudent,
  useCreateTeam,
  useDeleteStudent,
  useDeleteTeam,
  useGetAccessPermissions,
  useGetMentors,
  useGetTeams,
  useUpdateStudent,
  useUpdateTeam,
} from '@workspace/api-client-react';
import type { MentorOption, Student, Team, TeamDeleteInput } from '@workspace/api-client-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { LogoutButton } from '@/auth';
import { RosterHistory } from './roster-history';
import { SessionRegistration } from './manage-sessions';

type TeamFields = { name: string; mainMentorId: string };
type TeamBaseline = { name: string; mainMentorId: number };
type NameFields = { name: string };
const inputClass = 'h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';
const secondaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

function errorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 403) {
      return 'Sua permissão de manutenção não está mais ativa. Atualize a página para conferir seu acesso.';
    }
    if ('data' in error && error.data && typeof error.data === 'object' && 'error' in error.data && typeof error.data.error === 'string') {
      return error.data.error;
    }
  }
  return 'Não foi possível salvar a alteração. Confira os dados e tente novamente.';
}

function isConflict(error: unknown) {
  return error !== null && typeof error === 'object' && 'status' in error && error.status === 409;
}

function MutationError({ error, onRefresh, testId }: { error: unknown; onRefresh: () => void; testId: string }) {
  if (!error) return null;
  return <div role="alert" className="text-xs text-destructive" data-testid={testId}>
    <p>{errorMessage(error)}</p>
    {isConflict(error) && <button type="button" className="mt-2 inline-flex items-center gap-2 font-semibold underline underline-offset-4" onClick={onRefresh} data-testid={`${testId}-atualizar`}><RefreshCw size={13} /> Atualizar a relação</button>}
  </div>;
}

export default function ManagePage() {
  const access = useGetAccessPermissions({
    query: { queryKey: getGetAccessPermissionsQueryKey(), staleTime: 0, refetchOnMount: 'always' },
  });

  return (
    <div className="grain min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border/70 bg-card/70">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-5">
          <Link href="/user-portal" className="flex min-w-0 items-center gap-3" data-testid="link-voltar-relacao-cabecalho">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Waypoints size={19} /></span>
            <span className="font-display text-lg leading-tight sm:text-xl">HUB de Mentorias PIBEP PUCPR</span>
          </Link>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-[1080px] px-5 pb-16 pt-8 sm:px-8 sm:pt-10">
        <Link href="/user-portal" className="mb-7 inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline" data-testid="link-voltar-relacao">
          <ArrowLeft size={15} /> Voltar à relação oficial
        </Link>
        <div className="mb-8 border-b border-border pb-7">
           <div className="mb-2 font-mono-ui text-[10px] uppercase tracking-[0.17em] text-muted-foreground">PIBEP 2026 · 16ª edição / administração</div>
          <h1 className="font-display text-[36px] leading-tight tracking-[-0.04em] sm:text-[44px]">Conferência das equipes</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Atualize a relação oficial com atenção. Alterações salvas aparecem também na consulta das equipes.</p>
        </div>
        {access.isLoading ? (
          <div className="space-y-4" data-testid="loading-permissoes"><div className="h-5 w-48 animate-pulse rounded bg-muted" /><div className="h-56 animate-pulse rounded-2xl bg-muted" /></div>
        ) : access.isError ? (
          <AccessNotice title="Não foi possível conferir seu acesso." description="A manutenção não está disponível enquanto a permissão não puder ser verificada." onRetry={() => void access.refetch()} />
        ) : !access.data?.canManage ? (
           <AccessNotice title="Manutenção restrita" description="Somente administradores designados podem alterar equipes ou estudantes." />
        ) : (
          <ManageWorkspace />
        )}
      </main>
    </div>
  );
}

function AccessNotice({ title, description, onRetry }: { title: string; description: string; onRetry?: () => void }) {
  return (
    <section className="rounded-2xl border border-border bg-card px-6 py-12 text-center" data-testid="state-sem-permissao-manage">
      <LockKeyhole className="mx-auto mb-4 text-primary" size={25} />
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {onRetry && <button type="button" className={`${primaryButton} mt-5`} onClick={onRetry} data-testid="button-tentar-acesso"><RefreshCw size={14} /> Tentar novamente</button>}
    </section>
  );
}

function ManageWorkspace() {
  const queryClient = useQueryClient();
  const teams = useGetTeams({ query: { queryKey: getGetTeamsQueryKey(), staleTime: 0, refetchOnMount: 'always' } });
  const mentors = useGetMentors({ query: { queryKey: getGetMentorsQueryKey(), staleTime: 0, refetchOnMount: 'always' } });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const selected = teams.data?.find((team) => team.id === selectedId);
  const refresh = () => { void teams.refetch(); void mentors.refetch(); };
  const commit = async (updater: (current: Team[]) => Team[]) => {
    await queryClient.cancelQueries({ queryKey: getGetTeamsQueryKey() });
    queryClient.setQueryData<Team[]>(getGetTeamsQueryKey(), (current) => updater(current ?? []));
    // A confirmed write is already visible. Reading again must never turn it into a save error.
    void queryClient.invalidateQueries({ queryKey: getGetTeamsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetRosterAuditQueryKey() });
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl tracking-[-0.035em]">Relação em manutenção</h2>
          <p className="mt-1 text-xs text-muted-foreground">{teams.data ? `${teams.data.length} equipes registradas` : 'Carregando a relação…'}</p>
        </div>
        <button type="button" className={primaryButton} data-testid="button-nova-equipe" onClick={() => { setCreating(true); setSelectedId(null); setNotice(''); }}>
          <Plus size={16} /> Nova equipe
        </button>
      </div>
      {notice && <div role="status" data-testid="status-alteracao" className="mb-5 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-xs font-semibold text-primary">{notice}</div>}
      {teams.isError && teams.data && <div role="alert" data-testid="status-leitura-desatualizada" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-600/25 bg-amber-100/50 px-4 py-3 text-xs text-foreground">
        <span>A atualização da leitura falhou. Os dados salvos estão visíveis, mas a relação pode estar desatualizada.</span>
        <button type="button" className={secondaryButton} onClick={refresh} data-testid="button-atualizar-leitura"><RefreshCw size={14} /> Atualizar relação</button>
      </div>}
      {(teams.isLoading || mentors.isLoading) ? (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]" data-testid="loading-manage">
          <div className="h-64 animate-pulse rounded-2xl bg-muted" /><div className="h-96 animate-pulse rounded-2xl bg-muted" />
        </div>
      ) : (teams.isError && !teams.data) || (mentors.isError && !mentors.data) ? (
        <section className="rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-12 text-center" data-testid="state-erro-manage">
          <CircleAlert size={25} className="mx-auto mb-3 text-destructive" />
          <h3 className="font-display text-2xl">A relação não carregou.</h3>
          <p className="mt-2 text-sm text-muted-foreground">Não é seguro editar sem os dados atuais. Tente atualizar a leitura.</p>
          <button type="button" className={`${primaryButton} mt-5`} data-testid="button-atualizar-manage" onClick={refresh}><RefreshCw size={14} /> Tentar novamente</button>
        </section>
      ) : (
        <div className="grid items-start gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="Equipes registradas">
            <div className="border-b border-border bg-muted/40 px-4 py-3 font-mono-ui text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Equipes registradas</div>
            {!teams.data?.length ? <p className="px-4 py-8 text-center text-xs leading-6 text-muted-foreground" data-testid="state-vazio-manage">Ainda não há equipes. Comece por “Nova equipe”.</p> : (
              <div className="max-h-[620px] overflow-y-auto">
                {teams.data.map((team) => (
                  <button type="button" key={team.id} data-testid={`button-selecionar-equipe-${team.id}`} onClick={() => { setSelectedId(team.id); setCreating(false); setNotice(''); }}
                    className={`flex w-full flex-col border-b border-border/60 px-4 py-3.5 text-left last:border-b-0 hover:bg-muted/50 ${!creating && selectedId === team.id ? 'bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]' : ''}`}>
                    <span className="text-sm font-semibold leading-5">{team.name}</span>
                    <span className="mt-1 text-[11px] leading-4 text-muted-foreground">{team.mainMentor.name} · {team.students.length} estudantes</span>
                  </button>
                ))}
              </div>
            )}
          </aside>
          <section className="min-w-0">
            {creating ? <CreateTeamPanel mentors={mentors.data ?? []} onSaved={async (team) => { await commit((current) => [...current.filter((item) => item.id !== team.id), team]); setCreating(false); setSelectedId(team.id); setNotice('Equipe criada e relação atualizada.'); }} onCancel={() => setCreating(false)} onRefresh={refresh} /> :
              selected ? <TeamDetail key={selected.id} team={selected} mentors={mentors.data ?? []} commit={commit} onRefresh={refresh} onDeleted={() => { setSelectedId(null); setNotice('Equipe excluída e relação atualizada.'); }} onNotice={setNotice} /> :
                <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center" data-testid="state-selecione-equipe">
                  <ClipboardList className="mb-4 text-primary" size={27} />
                  <h3 className="font-display text-2xl">Escolha uma equipe para conferir</h3>
                  <p className="mt-2 max-w-sm text-xs leading-6 text-muted-foreground">Selecione uma equipe da relação para revisar mentor responsável e estudantes, ou crie uma nova equipe.</p>
                </div>}
          </section>
        </div>
      )}
      <RosterHistory team={selected} />
    </div>
  );
}

function TeamForm({ initial, mentors, submitLabel, pending, onSubmit, onRefresh, children }: { initial?: Team; mentors: MentorOption[]; submitLabel: string; pending: boolean; onSubmit: (values: TeamBaseline, baseline: TeamBaseline | null) => Promise<Team | void>; onRefresh: () => void; children?: ReactNode }) {
  const form = useForm<TeamFields>({ defaultValues: { name: initial?.name ?? '', mainMentorId: initial ? String(initial.mainMentor.id) : '' } });
  const baseline = useRef<TeamBaseline | null>(initial ? { name: initial.name, mainMentorId: initial.mainMentor.id } : null);
  const [error, setError] = useState<unknown>(null);
  // A clean form follows new server data; a draft keeps the version it was based on.
  useEffect(() => {
    if (!initial || form.formState.isDirty || pending) return;
    if (baseline.current?.name === initial.name && baseline.current.mainMentorId === initial.mainMentor.id) return;
    baseline.current = { name: initial.name, mainMentorId: initial.mainMentor.id };
    form.reset({ name: initial.name, mainMentorId: String(initial.mainMentor.id) });
    setError(null);
  }, [initial?.name, initial?.mainMentor.id, form.formState.isDirty, pending, form]);
  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={form.handleSubmit(async (values) => {
        const mentorId = Number(values.mainMentorId);
        if (!mentors.some((mentor) => mentor.id === mentorId)) { form.setError('mainMentorId', { message: 'Selecione um mentor disponível.' }); return; }
        setError(null);
        try {
          const saved = await onSubmit({ name: values.name.trim(), mainMentorId: mentorId }, baseline.current);
          if (saved) {
            baseline.current = { name: saved.name, mainMentorId: saved.mainMentor.id };
            form.reset({ name: saved.name, mainMentorId: String(saved.mainMentor.id) });
          }
        }
        catch (cause) { setError(cause); }
      })}>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField control={form.control} name="name" rules={{ validate: (value) => value.trim().length > 0 && value.trim().length <= 120 || 'Informe um nome de até 120 caracteres.' }} render={({ field }) => (
            <FormItem><FormLabel className="text-xs font-semibold">Nome da equipe</FormLabel><FormControl><input {...field} className={inputClass} maxLength={120} placeholder="Nome da equipe" data-testid="input-nome-equipe" /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="mainMentorId" rules={{ required: 'Selecione um mentor responsável.' }} render={({ field }) => (
            <FormItem><FormLabel className="text-xs font-semibold">Mentor responsável</FormLabel><FormControl><select {...field} className={inputClass} data-testid="select-mentor-equipe">
              <option value="">Selecione um mentor</option>{mentors.map((mentor) => <option key={mentor.id} value={mentor.id}>{mentor.name}</option>)}
            </select></FormControl><FormMessage /></FormItem>
          )} />
        </div>
        {children}
        {initial && baseline.current && (baseline.current.name !== initial.name || baseline.current.mainMentorId !== initial.mainMentor.id) && (
          <div role="status" className="space-y-2 text-xs text-amber-800" data-testid="status-equipe-alterada">
            <p>A equipe mudou em outra sessão. Seu rascunho foi preservado. Confira a versão atual antes de tentar salvar novamente.</p>
            <button type="button" disabled={pending} className={secondaryButton} onClick={() => {
              baseline.current = { name: initial.name, mainMentorId: initial.mainMentor.id };
              form.reset({ name: initial.name, mainMentorId: String(initial.mainMentor.id) });
              setError(null);
            }} data-testid="button-recarregar-formulario-equipe">Descartar rascunho e carregar versão atual</button>
          </div>
        )}
        {mentors.length === 0 && <p className="text-xs text-destructive" data-testid="status-sem-mentores">Não há mentores disponíveis para associação. Solicite o cadastro de um mentor antes de criar a equipe.</p>}
        <MutationError error={error} onRefresh={onRefresh} testId="erro-salvar-equipe" />
        <button type="submit" className={primaryButton} disabled={pending || mentors.length === 0} data-testid="button-salvar-equipe">{pending ? 'Salvando…' : submitLabel}</button>
      </form>
    </Form>
  );
}

function CreateTeamPanel({ mentors, onSaved, onCancel, onRefresh }: { mentors: MentorOption[]; onSaved: (team: Team) => Promise<void>; onCancel: () => void; onRefresh: () => void }) {
  const create = useCreateTeam();
  const [students, setStudents] = useState<string[]>([]);
  const [error, setError] = useState('');
  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-7" data-testid="panel-criar-equipe">
      <div className="mb-6 flex items-start justify-between gap-4 border-b border-border pb-5">
        <div><p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-primary">Nova entrada / 2026</p><h3 className="mt-1 font-display text-[27px] tracking-[-0.035em]">Registrar equipe</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Confira nome, mentor e composição inicial antes de salvar.</p></div>
        <button type="button" className={secondaryButton} onClick={onCancel} data-testid="button-cancelar-nova-equipe" aria-label="Cancelar nova equipe"><X size={15} /></button>
      </div>
      <TeamForm mentors={mentors} pending={create.isPending} submitLabel="Registrar equipe" onRefresh={onRefresh} onSubmit={async ({ name, mainMentorId }) => {
        if (students.some((student) => !student.trim() || student.trim().length > 200)) { setError('Preencha ou remova os estudantes em branco; cada nome pode ter até 200 caracteres.'); return; }
        setError('');
        const team = await create.mutateAsync({ data: { name, mainMentorId, students: students.map((student) => student.trim()) } });
        await onSaved(team);
      }}>
      <div className="border-t border-border pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-sm font-semibold">Estudantes iniciais</h4><p className="mt-1 text-xs text-muted-foreground">Opcional. Também podem ser adicionados depois.</p></div>
          <button type="button" className={secondaryButton} onClick={() => setStudents([...students, ''])} data-testid="button-adicionar-estudante-inicial"><Plus size={14} /> Adicionar nome</button>
        </div>
        <div className="space-y-2">{students.map((student, index) => <div className="flex gap-2" key={index}>
          <input className={inputClass} aria-label={`Nome do estudante inicial ${index + 1}`} maxLength={200} value={student} data-testid={`input-estudante-inicial-${index}`} onChange={(event) => setStudents(students.map((value, position) => position === index ? event.target.value : value))} />
          <button type="button" className={secondaryButton} aria-label={`Remover estudante inicial ${index + 1}`} data-testid={`button-remover-estudante-inicial-${index}`} onClick={() => setStudents(students.filter((_, position) => position !== index))}><X size={15} /></button>
        </div>)}</div>
        {error && <p role="alert" className="mt-3 text-xs text-destructive" data-testid="erro-estudantes-iniciais">{error}</p>}
      </div>
      </TeamForm>
    </div>
  );
}

function TeamDetail({ team, mentors, commit, onRefresh, onDeleted, onNotice }: { team: Team; mentors: MentorOption[]; commit: (updater: (current: Team[]) => Team[]) => Promise<void>; onRefresh: () => void; onDeleted: () => void; onNotice: (message: string) => void }) {
  const update = useUpdateTeam();
  const remove = useDeleteTeam();
  const [deleteSnapshot, setDeleteSnapshot] = useState<{ teamId: number; data: TeamDeleteInput } | null>(null);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  return (
    <div className="space-y-4" data-testid={`panel-equipe-${team.id}`}>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-7">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-5">
          <div><p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-primary">Conferência / equipe</p><h3 className="mt-1 break-words font-display text-[27px] tracking-[-0.035em]" data-testid={`text-manage-equipe-${team.id}`}>{team.name}</h3></div>
          <span className="rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold text-muted-foreground" data-testid={`text-sessoes-${team.id}`}>{team.sessionCount} {team.sessionCount === 1 ? 'sessão registrada' : 'sessões registradas'}</span>
        </div>
        <TeamForm initial={team} mentors={mentors} pending={update.isPending} submitLabel="Salvar alterações" onRefresh={onRefresh} onSubmit={async (data, baseline) => {
          if (!baseline) throw new Error('Não foi possível identificar a versão inicial da equipe.');
          const nameChanged = data.name !== baseline.name;
          const mentorChanged = data.mainMentorId !== baseline.mainMentorId;
          if (!nameChanged && !mentorChanged) { onNotice('Nenhuma alteração para salvar.'); return; }
          const saved = await update.mutateAsync({ teamId: team.id, data: {
            expectedName: baseline.name,
            expectedMainMentorId: baseline.mainMentorId,
            ...(nameChanged ? { name: data.name } : {}),
            ...(mentorChanged ? { mainMentorId: data.mainMentorId } : {}),
          } });
          await commit((current) => current.map((item) => item.id === team.id ? saved : item));
          onNotice('Dados da equipe salvos na relação oficial.');
          return saved;
        }} />
      </section>
      <SessionRegistration
        team={team}
        mentors={mentors}
        onSaved={() => commit((current) => current.map((item) =>
          item.id === team.id ? { ...item, sessionCount: item.sessionCount + 1 } : item
        ))}
        onNotice={onNotice}
      />
      <StudentSection team={team} commit={commit} onRefresh={onRefresh} onNotice={onNotice} />
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-7">
        <h4 className="text-sm font-semibold">Exclusão da equipe</h4>
        {team.sessionCount > 0 ? (
          <p className="mt-2 text-xs leading-6 text-muted-foreground" data-testid={`status-exclusao-bloqueada-${team.id}`}><LockKeyhole className="mr-1 inline align-middle" size={14} /> Esta equipe possui {team.sessionCount} {team.sessionCount === 1 ? 'sessão registrada' : 'sessões registradas'} e não pode ser excluída.</p>
        ) : (
          <>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">A exclusão remove a equipe e seus estudantes da relação. Esta ação não pode ser desfeita.</p>
            {!deleteSnapshot ? <button type="button" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-destructive/40 px-3 text-xs font-semibold text-destructive hover:bg-destructive/5" data-testid={`button-excluir-equipe-${team.id}`} onClick={() => {
              setDeleteError(null);
              setDeleteSnapshot({
                teamId: team.id,
                data: {
                  expectedName: team.name,
                  expectedMainMentorId: team.mainMentor.id,
                  expectedStudents: team.students.map(({ id, name, sortOrder }) => ({ id, name, sortOrder })),
                },
              });
            }}><Trash2 size={14} /> Excluir equipe</button> :
              <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4" data-testid={`confirmacao-excluir-equipe-${team.id}`}>
                <p className="text-xs font-semibold">Confirma a exclusão de “{deleteSnapshot.data.expectedName}” e seus estudantes?</p>
                <MutationError error={deleteError} onRefresh={() => { setDeleteSnapshot(null); setDeleteError(null); onRefresh(); }} testId={`erro-excluir-equipe-${team.id}`} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={secondaryButton} onClick={() => { setDeleteSnapshot(null); setDeleteError(null); }} data-testid={`button-cancelar-exclusao-equipe-${team.id}`}>Cancelar</button>
                  <button type="button" disabled={remove.isPending} className="inline-flex min-h-10 items-center rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground disabled:opacity-50" data-testid={`button-confirmar-exclusao-equipe-${team.id}`} onClick={async () => {
                    try { await remove.mutateAsync(deleteSnapshot); await commit((current) => current.filter((item) => item.id !== deleteSnapshot.teamId)); onDeleted(); }
                    catch (cause) { setDeleteError(cause); }
                  }}>{remove.isPending ? 'Excluindo…' : 'Sim, excluir equipe'}</button>
                </div>
              </div>}
          </>
        )}
      </section>
    </div>
  );
}

function StudentSection({ team, commit, onRefresh, onNotice }: { team: Team; commit: (updater: (current: Team[]) => Team[]) => Promise<void>; onRefresh: () => void; onNotice: (message: string) => void }) {
  const create = useCreateStudent();
  const form = useForm<NameFields>({ defaultValues: { name: '' } });
  const [error, setError] = useState<unknown>(null);
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" data-testid={`section-estudantes-${team.id}`}>
      <div className="mb-5 flex items-center gap-2 border-b border-border pb-4"><UsersRound size={17} className="text-primary" /><h4 className="text-sm font-semibold">Estudantes da equipe</h4><span className="ml-auto text-xs text-muted-foreground">{team.students.length}</span></div>
      {team.students.length === 0 ? <p className="mb-5 rounded-lg bg-muted/50 px-4 py-5 text-xs leading-5 text-muted-foreground" data-testid={`state-sem-estudantes-${team.id}`}>Nenhum estudante nesta equipe. Adicione o primeiro nome abaixo.</p> :
        <div className="mb-6 divide-y divide-border/70">{[...team.students].sort((a, b) => a.sortOrder - b.sortOrder).map((student) =>
          <StudentRow key={student.id} teamId={team.id} student={student} commit={commit} onRefresh={onRefresh} onNotice={onNotice} />
        )}</div>}
      <Form {...form}><form className="flex flex-col items-start gap-3 sm:flex-row sm:items-end" onSubmit={form.handleSubmit(async (values) => {
        setError(null);
        try {
          const saved = await create.mutateAsync({ teamId: team.id, data: { name: values.name.trim() } });
          await commit((current) => current.map((item) => item.id === team.id ? { ...item, students: [...item.students.filter((entry) => entry.id !== saved.id), saved].sort((a, b) => a.sortOrder - b.sortOrder) } : item));
          form.reset(); onNotice('Estudante adicionado à equipe.');
        } catch (cause) { setError(cause); }
      })}>
        <FormField control={form.control} name="name" rules={{ validate: (value) => value.trim().length > 0 && value.trim().length <= 200 || 'Informe um nome de até 200 caracteres.' }} render={({ field }) => (
          <FormItem className="w-full flex-1"><FormLabel className="text-xs font-semibold">Adicionar estudante</FormLabel><FormControl><input {...field} className={inputClass} maxLength={200} placeholder="Nome completo" data-testid={`input-novo-estudante-${team.id}`} /></FormControl><FormMessage /></FormItem>
        )} />
        <button type="submit" disabled={create.isPending} className={primaryButton} data-testid={`button-salvar-estudante-${team.id}`}><Plus size={14} /> {create.isPending ? 'Adicionando…' : 'Adicionar'}</button>
      </form></Form>
      <MutationError error={error} onRefresh={onRefresh} testId="erro-adicionar-estudante" />
    </section>
  );
}

function StudentRow({ teamId, student, commit, onRefresh, onNotice }: { teamId: number; student: Student; commit: (updater: (current: Team[]) => Team[]) => Promise<void>; onRefresh: () => void; onNotice: (message: string) => void }) {
  const update = useUpdateStudent();
  const remove = useDeleteStudent();
  const form = useForm<NameFields>({ defaultValues: { name: student.name } });
  const [editing, setEditing] = useState(false);
  const [renameBaseline, setRenameBaseline] = useState<string | null>(null);
  const [deleteSnapshot, setDeleteSnapshot] = useState<{ teamId: number; studentId: number; data: { expectedName: string } } | null>(null);
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="py-3" data-testid={`row-estudante-${student.id}`}>
      {editing ? <Form {...form}><form className="flex flex-col gap-2 sm:flex-row sm:items-start" onSubmit={form.handleSubmit(async ({ name }) => {
        setError(null);
        if (renameBaseline === null) { setError(new Error('Não foi possível identificar o nome inicial do estudante.')); return; }
        if (name.trim() === renameBaseline) { setEditing(false); setRenameBaseline(null); onNotice('Nenhuma alteração para salvar.'); return; }
        try {
          const saved = await update.mutateAsync({ teamId, studentId: student.id, data: { name: name.trim(), expectedName: renameBaseline } });
          await commit((current) => current.map((item) => item.id === teamId ? { ...item, students: item.students.map((entry) => entry.id === student.id ? saved : entry) } : item));
          form.reset({ name: saved.name }); setRenameBaseline(null); setEditing(false); onNotice('Nome do estudante atualizado.');
        } catch (cause) { setError(cause); }
      })}>
        <FormField control={form.control} name="name" rules={{ validate: (value) => value.trim().length > 0 && value.trim().length <= 200 || 'Informe um nome de até 200 caracteres.' }} render={({ field }) => (
          <FormItem className="flex-1"><FormControl><input {...field} className={inputClass} maxLength={200} aria-label={`Nome de ${student.name}`} data-testid={`input-editar-estudante-${student.id}`} /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="flex gap-2"><button type="submit" disabled={update.isPending} className={primaryButton} data-testid={`button-confirmar-edicao-estudante-${student.id}`}>{update.isPending ? 'Salvando…' : 'Salvar'}</button><button type="button" className={secondaryButton} data-testid={`button-cancelar-edicao-estudante-${student.id}`} onClick={() => { form.reset({ name: student.name }); setRenameBaseline(null); setEditing(false); setError(null); }}>Cancelar</button></div>
      </form></Form> : <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words text-sm" data-testid={`text-estudante-${student.id}`}>{student.name}</span><div className="flex gap-2">
         <button type="button" className={secondaryButton} data-testid={`button-editar-estudante-${student.id}`} onClick={() => { form.reset({ name: student.name }); setRenameBaseline(student.name); setError(null); setEditing(true); setDeleteSnapshot(null); }}>Renomear</button>
        <button type="button" className={`${secondaryButton} text-destructive`} data-testid={`button-excluir-estudante-${student.id}`} onClick={() => { setDeleteSnapshot({ teamId, studentId: student.id, data: { expectedName: student.name } }); setError(null); setEditing(false); }}>Remover</button>
      </div></div>}
      {deleteSnapshot && <div className="mt-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3" data-testid={`confirmacao-excluir-estudante-${student.id}`}>
        <p className="text-xs font-semibold">Remover “{deleteSnapshot.data.expectedName}” desta equipe?</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={secondaryButton} data-testid={`button-cancelar-exclusao-estudante-${student.id}`} onClick={() => { setDeleteSnapshot(null); setError(null); }}>Cancelar</button>
          <button type="button" disabled={remove.isPending} className="rounded-lg bg-destructive px-4 text-xs font-semibold text-destructive-foreground disabled:opacity-50" data-testid={`button-confirmar-exclusao-estudante-${student.id}`} onClick={async () => {
            setError(null);
            try {
              await remove.mutateAsync(deleteSnapshot);
              await commit((current) => current.map((item) => item.id === deleteSnapshot.teamId ? {
                ...item, students: item.students.filter((entry) => entry.id !== deleteSnapshot.studentId).sort((a, b) => a.sortOrder - b.sortOrder).map((entry, index) => ({ ...entry, sortOrder: index })),
              } : item));
              setDeleteSnapshot(null); onNotice('Estudante removido da equipe.');
            } catch (cause) { setError(cause); }
          }}>{remove.isPending ? 'Removendo…' : 'Sim, remover'}</button></div>
      </div>}
      {editing && renameBaseline !== null && renameBaseline !== student.name && <p className="mt-2 text-xs text-amber-800" data-testid={`status-nome-alterado-estudante-${student.id}`}>
        A relação agora registra “{student.name}” em vez de “{renameBaseline}”. Seu rascunho foi preservado, mas ainda usa o nome anterior como referência. Para editar a nova versão, cancele e clique em Renomear novamente.
      </p>}
      <MutationError error={error} onRefresh={() => { if (deleteSnapshot) { setDeleteSnapshot(null); setError(null); } onRefresh(); }} testId={`erro-estudante-${student.id}`} />
    </div>
  );
}