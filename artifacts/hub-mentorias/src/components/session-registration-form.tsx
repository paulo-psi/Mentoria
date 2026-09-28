import { useState, type ReactNode } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type Control } from 'react-hook-form';
import { z } from 'zod';
import { LoaderCircle } from 'lucide-react';
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
  'w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm leading-6 text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-900/10';

function localToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function isValidCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const scoreSchema = (label: string) =>
  z
    .string()
    .min(1, `Selecione ${label.toLocaleLowerCase('pt-BR')}.`)
    .refine((value) => /^\d+$/.test(value) && Number(value) >= 0 && Number(value) <= 10, {
      message: 'Escolha uma nota inteira entre 0 e 10.',
    });

const textSchema = z
  .string()
  .trim()
  .min(1, 'Preencha este campo.')
  .max(5000, 'Use até 5.000 caracteres.');

/**
 * The schema validates string values produced by native HTML controls. The
 * payload builder converts validated identifiers and scores to API numbers.
 */
export const mentoringSessionInputSchema = z.object({
  mentorId: z
    .string()
    .min(1, 'Selecione o mentor que conduziu a sessão.')
    .refine((value) => /^\d+$/.test(value) && Number(value) >= 1, 'Selecione um mentor disponível.'),
  sessionType: z.enum(['principal', 'transversal', 'externo']),
  sessionDate: z
    .string()
    .min(1, 'Informe a data da sessão.')
    .refine(isValidCalendarDate, 'Informe uma data de calendário válida.'),
  teamNps: scoreSchema('uma nota para o NPS da mentoria'),
  teamActionability: scoreSchema('uma nota para clareza e acionabilidade'),
  mentorCommitment: scoreSchema('uma nota para o comprometimento da equipe'),
  mentorTraction: scoreSchema('uma nota para tração e execução'),
  teamFeedbackStrongPoints: textSchema,
  teamFeedbackImprovements: textSchema,
  agreedNextSteps: textSchema,
  mentorQualitativeAssessment: textSchema,
});

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

export function buildMentoringSessionPayload(
  values: SessionFormFields,
): MentoringSessionInput {
  return {
    mentorId: Number(values.mentorId),
    sessionType: values.sessionType,
    sessionDate: values.sessionDate,
    teamNps: Number(values.teamNps),
    teamActionability: Number(values.teamActionability),
    mentorCommitment: Number(values.mentorCommitment),
    mentorTraction: Number(values.mentorTraction),
    teamFeedbackStrongPoints: values.teamFeedbackStrongPoints,
    teamFeedbackImprovements: values.teamFeedbackImprovements,
    agreedNextSteps: values.agreedNextSteps,
    mentorQualitativeAssessment: values.mentorQualitativeAssessment,
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

const scoreFields = [
  ['teamNps', 'NPS da Mentoria', 'team'],
  ['teamActionability', 'Clareza / Acionabilidade', 'team'],
  ['mentorCommitment', 'Comprometimento da Equipe', 'mentor'],
  ['mentorTraction', 'Tração / Execução', 'mentor'],
] as const;

const qualitativeFields = [
  ['teamFeedbackStrongPoints', 'Pontos Fortes', 'O que funcionou bem para a equipe?'],
  ['teamFeedbackImprovements', 'Oportunidades de Melhoria', 'Registre os pontos de atenção ou ajustes sugeridos pela equipe.'],
  ['mentorQualitativeAssessment', 'Parecer Geral do Mentor', 'Diagnóstico de maturidade e ritmo da equipe.'],
  ['agreedNextSteps', 'Combinados e Próximos Passos', 'Entregáveis acordados para a semana seguinte.'],
] as const;

function SectionHeading({ id, number, title, description }: { id: string; number: string; title: string; description: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="font-mono-ui pt-0.5 text-[10px] font-medium tracking-[0.12em] text-zinc-400">{number}</span>
      <div>
        <h3 className="text-sm font-semibold text-zinc-900" id={id}>{title}</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      </div>
    </div>
  );
}

export function SessionRegistrationForm({
  team,
  mentors,
  defaultMentorId,
  contextContent,
  onSaved,
  onNotice,
  onCancel,
  submitLabel = 'Salvar Registro',
  testIdSuffix = String(team.id),
}: {
  team: Team;
  mentors: MentorOption[];
  defaultMentorId?: number;
  contextContent?: ReactNode;
  onSaved: () => Promise<void> | void;
  onNotice?: (message: string) => void;
  onCancel?: () => void;
  submitLabel?: string;
  testIdSuffix?: string;
}) {
  const create = useCreateMentoringSession();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SessionFormFields>({
    resolver: zodResolver(mentoringSessionInputSchema),
    defaultValues: emptySessionForm(defaultMentorId),
  });
  const pending = create.isPending || form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit(async (values) => {
          setError(null);
          const payload = buildMentoringSessionPayload(values);
          const mentorId = payload.mentorId;
          if (!mentors.some((mentor) => mentor.id === mentorId)) {
            setError('Selecione um mentor disponível.');
            return;
          }

          try {
            await create.mutateAsync({
              teamId: team.id,
              data: payload,
            });
            await onSaved();
            form.reset(emptySessionForm(defaultMentorId));
            onNotice?.('Sessão registrada na equipe.');
          } catch (cause) {
            setError(responseError(cause));
          }
        })}
      >
        <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5" aria-labelledby={`context-heading-${testIdSuffix}`}>
          <SectionHeading
            id={`context-heading-${testIdSuffix}`}
            number="01"
            title="Contexto do Encontro"
            description="Identifique a equipe, quem conduziu a conversa e quando ela aconteceu."
          />
          {contextContent}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="sessionType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-zinc-700">Tipo de Mentoria</FormLabel>
                  <FormControl>
                    <select {...field} className={fieldClass} data-testid={`select-tipo-sessao-${testIdSuffix}`}>
                      <option value="principal">Principal</option>
                      <option value="transversal">Transversal</option>
                      <option value="externo">Externo</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sessionDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold text-zinc-700">Data da Sessão</FormLabel>
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
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel className="text-xs font-semibold text-zinc-700">Mentor</FormLabel>
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
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5" aria-labelledby={`team-evaluation-heading-${testIdSuffix}`}>
          <SectionHeading
            id={`team-evaluation-heading-${testIdSuffix}`}
            number="02"
            title="Avaliação da Equipe"
            description="Visão da equipe sobre a mentoria recebida."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {scoreFields.filter(([, , group]) => group === 'team').map(([name, label]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-zinc-700">{label} (0 a 10)</FormLabel>
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
            {qualitativeFields.filter(([name]) => name === 'teamFeedbackStrongPoints' || name === 'teamFeedbackImprovements').map(([name, label, placeholder]) => (
              <QualitativeField
                key={name}
                control={form.control}
                label={label}
                name={name}
                placeholder={placeholder}
                testIdSuffix={testIdSuffix}
                rows={3}
              />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5" aria-labelledby={`mentor-evaluation-heading-${testIdSuffix}`}>
          <SectionHeading
            id={`mentor-evaluation-heading-${testIdSuffix}`}
            number="03"
            title="Avaliação do Mentor"
            description="Visão do mentor sobre o comprometimento e o ritmo da equipe."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {scoreFields.filter(([, , group]) => group === 'mentor').map(([name, label]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold text-zinc-700">{label} (0 a 10)</FormLabel>
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
            <QualitativeField
              control={form.control}
              label="Parecer Geral do Mentor"
              name="mentorQualitativeAssessment"
              placeholder="Diagnóstico de maturidade e ritmo da equipe."
              testIdSuffix={testIdSuffix}
              rows={4}
              className="sm:col-span-2"
            />
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5" aria-labelledby={`next-steps-heading-${testIdSuffix}`}>
          <SectionHeading
            id={`next-steps-heading-${testIdSuffix}`}
            number="04"
            title="Próximos Passos"
            description="Deixe os entregáveis da próxima semana claros para a equipe."
          />
          <QualitativeField
            control={form.control}
            label="Combinados e Próximos Passos"
            name="agreedNextSteps"
            placeholder="Entregáveis acordados para a semana seguinte."
            testIdSuffix={testIdSuffix}
            rows={3}
          />
        </section>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700" data-testid={`erro-salvar-sessao-${testIdSuffix}`}>
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 border-t border-zinc-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
          {onCancel && (
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid={`button-cancelar-sessao-${testIdSuffix}`}
              disabled={pending}
              onClick={onCancel}
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending}
            data-testid={`button-salvar-sessao-${testIdSuffix}`}
          >
            {pending && <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />}
            {pending ? 'Salvando registro…' : submitLabel}
          </button>
        </div>
      </form>
    </Form>
  );
}

function QualitativeField({
  control,
  name,
  label,
  placeholder,
  testIdSuffix,
  rows,
  className,
}: {
  control: Control<SessionFormFields>;
  name: 'teamFeedbackStrongPoints' | 'teamFeedbackImprovements' | 'agreedNextSteps' | 'mentorQualitativeAssessment';
  label: string;
  placeholder: string;
  testIdSuffix: string;
  rows: number;
  className?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <div className="flex items-baseline justify-between gap-2">
            <FormLabel className="text-xs font-semibold text-zinc-700">{label}</FormLabel>
            <span className="font-mono-ui text-[10px] tabular-nums text-zinc-400">{field.value.length}/5000</span>
          </div>
          <FormControl>
            <textarea
              {...field}
              className={`${areaClass} ${rows === 4 ? 'min-h-32' : 'min-h-24'}`}
              maxLength={5000}
              placeholder={placeholder}
              rows={rows}
              data-testid={`textarea-${name}-${testIdSuffix}`}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}