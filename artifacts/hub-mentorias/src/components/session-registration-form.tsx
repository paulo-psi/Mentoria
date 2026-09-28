import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  useCreateMentoringSession,
  type MentorOption,
  type MentoringSessionInput,
  type Team,
} from '@workspace/api-client-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

export type SessionFormFields = {
  sessionType: MentoringSessionInput['sessionType'];
  sessionDate: string;
  mentorId: string;
  teamNps: string;
  teamActionability: string;
  mentorCommitment: string;
  mentorTraction: string;
  teamFeedbackStrongPoints: string;
  teamFeedbackImprovements: string;
  agreedNextSteps: string;
  mentorQualitativeAssessment: string;
};

const fieldClass =
  'h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-900/10';
const areaClass =
  'min-h-28 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm leading-6 text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-900/10';

function localToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export function emptySessionForm(defaultMentorId?: number): SessionFormFields {
  return {
    sessionType: 'principal',
    sessionDate: localToday(),
    mentorId: defaultMentorId ? String(defaultMentorId) : '',
    teamNps: '',
    teamActionability: '',
    mentorCommitment: '',
    mentorTraction: '',
    teamFeedbackStrongPoints: '',
    teamFeedbackImprovements: '',
    agreedNextSteps: '',
    mentorQualitativeAssessment: '',
  };
}

export function buildMentoringSessionPayload(values: SessionFormFields): MentoringSessionInput {
  return {
    mentorId: Number(values.mentorId),
    sessionType: values.sessionType,
    sessionDate: values.sessionDate,
    teamNps: Number(values.teamNps),
    teamActionability: Number(values.teamActionability),
    mentorCommitment: Number(values.mentorCommitment),
    mentorTraction: Number(values.mentorTraction),
    teamFeedbackStrongPoints: values.teamFeedbackStrongPoints.trim(),
    teamFeedbackImprovements: values.teamFeedbackImprovements.trim(),
    agreedNextSteps: values.agreedNextSteps.trim(),
    mentorQualitativeAssessment: values.mentorQualitativeAssessment.trim(),
  };
}

export function responseError(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'data' in error &&
    error.data &&
    typeof error.data === 'object' &&
    'error' in error.data &&
    typeof error.data.error === 'string'
  ) {
    return error.data.error;
  }
  if (error && typeof error === 'object' && 'status' in error && error.status === 403) {
    return 'Sua permissão para registrar mentorias não está mais ativa. Atualize a página para conferir seu acesso.';
  }
  return 'Não foi possível registrar a sessão. Confira os dados e tente novamente.';
}

function scoreRule(value: string) {
  if (value === '') return 'Selecione uma nota.';
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 10
    ? true
    : 'Escolha uma nota inteira entre 0 e 10.';
}

const scoreFields = [
  ['teamNps', 'NPS da equipe'],
  ['teamActionability', 'Aplicabilidade para a equipe'],
  ['mentorCommitment', 'Comprometimento do mentor'],
  ['mentorTraction', 'Tração do mentor'],
] as const;

const qualitativeFields = [
  ['teamFeedbackStrongPoints', 'Pontos fortes observados', 'O que avançou bem nesta sessão?'],
  ['teamFeedbackImprovements', 'Oportunidades de melhoria', 'Onde a equipe precisa de mais atenção?'],
  ['agreedNextSteps', 'Próximos passos acordados', 'Registre os compromissos e responsáveis combinados.'],
  ['mentorQualitativeAssessment', 'Avaliação qualitativa do mentor', 'Síntese do parecer do mentor sobre a equipe.'],
] as const;

export function SessionRegistrationForm({
  team,
  mentors,
  defaultMentorId,
  onSaved,
  onNotice,
  testIdSuffix = String(team.id),
}: {
  team: Team;
  mentors: MentorOption[];
  defaultMentorId?: number;
  onSaved: () => Promise<void> | void;
  onNotice?: (message: string) => void;
  testIdSuffix?: string;
}) {
  const create = useCreateMentoringSession();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SessionFormFields>({
    defaultValues: emptySessionForm(defaultMentorId),
  });
  const pending = create.isPending || form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        className="space-y-6"
        onSubmit={form.handleSubmit(async (values) => {
          setError(null);
          const mentorId = Number(values.mentorId);
          if (!mentors.some((mentor) => mentor.id === mentorId)) {
            form.setError('mentorId', { message: 'Selecione um mentor disponível.' });
            return;
          }

          try {
            await create.mutateAsync({
              teamId: team.id,
              data: buildMentoringSessionPayload(values),
            });
            await onSaved();
            form.reset(emptySessionForm(defaultMentorId));
            onNotice?.('Sessão registrada na equipe.');
          } catch (cause) {
            setError(responseError(cause));
          }
        })}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="sessionType"
            rules={{ required: 'Selecione o tipo de sessão.' }}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-zinc-700">Tipo de sessão</FormLabel>
                <FormControl>
                  <select {...field} className={fieldClass} data-testid={`select-tipo-sessao-${testIdSuffix}`}>
                    <option value="principal">Principal</option>
                    <option value="transversal">Transversal</option>
                    <option value="externo">Externa</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sessionDate"
            rules={{
              required: 'Informe a data da sessão.',
              validate: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) || 'Informe uma data válida.',
            }}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold text-zinc-700">Data da sessão</FormLabel>
                <FormControl>
                  <input {...field} type="date" className={fieldClass} data-testid={`input-data-sessao-${testIdSuffix}`} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mentorId"
            rules={{ required: 'Selecione o mentor que conduziu a sessão.' }}
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel className="text-xs font-semibold text-zinc-700">Mentor da sessão</FormLabel>
                <FormControl>
                  <select {...field} className={fieldClass} data-testid={`select-mentor-sessao-${testIdSuffix}`}>
                    <option value="">Selecione um mentor</option>
                    {mentors.map((mentor) => (
                      <option key={mentor.id} value={mentor.id}>
                        {mentor.name}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {scoreFields.map(([name, label]) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              rules={{ validate: scoreRule }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-zinc-700">{label} (0–10)</FormLabel>
                  <FormControl>
                    <select {...field} className={fieldClass} data-testid={`select-${name}-sessao-${testIdSuffix}`}>
                      <option value="">Selecione uma nota</option>
                      {Array.from({ length: 11 }, (_, score) => (
                        <option key={score} value={score}>
                          {score}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>

        <div className="border-t border-zinc-200 pt-5">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">Registro qualitativo</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Notas objetivas para manter o histórico da equipe útil.</p>
            </div>
            <span className="hidden shrink-0 font-mono-ui text-[10px] text-zinc-400 sm:block">até 5.000 caracteres</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {qualitativeFields.map(([name, label, placeholder]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                rules={{
                  validate: (value) =>
                    value.trim().length > 0 && value.trim().length <= 5000
                      ? true
                      : 'Preencha o campo com até 5.000 caracteres.',
                }}
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-baseline justify-between gap-2">
                      <FormLabel className="text-xs font-semibold text-zinc-700">{label}</FormLabel>
                      <span className="font-mono-ui text-[10px] tabular-nums text-zinc-400">{field.value.length}/5000</span>
                    </div>
                    <FormControl>
                      <textarea
                        {...field}
                        className={areaClass}
                        maxLength={5000}
                        placeholder={placeholder}
                        data-testid={`textarea-${name}-${testIdSuffix}`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700" data-testid={`erro-salvar-sessao-${testIdSuffix}`}>
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 border-t border-zinc-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-5 text-zinc-500">Todos os campos de avaliação e contexto são obrigatórios.</p>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending}
            data-testid={`button-salvar-sessao-${testIdSuffix}`}
          >
            {pending ? 'Salvando sessão…' : 'Registrar sessão'}
          </button>
        </div>
      </form>
    </Form>
  );
}