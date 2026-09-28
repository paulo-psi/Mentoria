import type { MentorOption, Team } from '@workspace/api-client-react';
import { SessionRegistrationForm } from '@/components/session-registration-form';

export function SessionRegistration({
  team,
  mentors,
  onSaved,
  onNotice,
}: {
  team: Team;
  mentors: MentorOption[];
  onSaved: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" data-testid={`section-sessao-${team.id}`}>
      <div className="mb-5 border-b border-border pb-4">
        <h4 className="text-sm font-semibold">Registrar sessão</h4>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Registre uma sessão principal, transversal ou externa. O mentor pode ser diferente do responsável pela equipe.
        </p>
      </div>
      {mentors.length === 0 ? (
        <p className="text-xs text-destructive" data-testid={`status-sem-mentores-sessao-${team.id}`}>
          Não há mentores oficiais disponíveis para registrar uma sessão.
        </p>
      ) : (
        <SessionRegistrationForm
          mentors={mentors}
          onNotice={onNotice}
          onSaved={onSaved}
          team={team}
        />
      )}
    </section>
  );
}