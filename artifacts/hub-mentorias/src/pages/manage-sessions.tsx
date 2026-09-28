import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  useCreateMentoringSession,
  type MentorOption,
  type MentoringSessionInput,
  type Team,
} from "@workspace/api-client-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

type SessionFormFields = {
  sessionType: MentoringSessionInput["sessionType"];
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

const fieldClass = "h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
const areaClass = "min-h-24 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
const saveButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function localToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function emptySessionForm(): SessionFormFields {
  return {
    sessionType: "principal",
    sessionDate: localToday(),
    mentorId: "",
    teamNps: "",
    teamActionability: "",
    mentorCommitment: "",
    mentorTraction: "",
    teamFeedbackStrongPoints: "",
    teamFeedbackImprovements: "",
    agreedNextSteps: "",
    mentorQualitativeAssessment: "",
  };
}

function responseError(error: unknown) {
  if (error && typeof error === "object" && "data" in error && error.data && typeof error.data === "object" && "error" in error.data && typeof error.data.error === "string") {
    return error.data.error;
  }
  if (error && typeof error === "object" && "status" in error && error.status === 403) {
    return "Sua permissão de administrador não está mais ativa. Atualize a página para conferir seu acesso.";
  }
  return "Não foi possível registrar a sessão. Confira os dados e tente novamente.";
}

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
  const create = useCreateMentoringSession();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SessionFormFields>({ defaultValues: emptySessionForm() });

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
        <Form {...form}>
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit(async (values) => {
              setError(null);
              const mentorId = Number(values.mentorId);
              if (!mentors.some((mentor) => mentor.id === mentorId)) {
                form.setError("mentorId", { message: "Selecione um mentor disponível." });
                return;
              }

              try {
                await create.mutateAsync({
                  teamId: team.id,
                  data: {
                    sessionType: values.sessionType,
                    sessionDate: values.sessionDate,
                    mentorId,
                    teamNps: Number(values.teamNps),
                    teamActionability: Number(values.teamActionability),
                    mentorCommitment: Number(values.mentorCommitment),
                    mentorTraction: Number(values.mentorTraction),
                    teamFeedbackStrongPoints: values.teamFeedbackStrongPoints.trim(),
                    teamFeedbackImprovements: values.teamFeedbackImprovements.trim(),
                    agreedNextSteps: values.agreedNextSteps.trim(),
                    mentorQualitativeAssessment: values.mentorQualitativeAssessment.trim(),
                  },
                });
                await onSaved();
                form.reset(emptySessionForm());
                onNotice("Sessão registrada na equipe.");
              } catch (cause) {
                setError(responseError(cause));
              }
            })}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="sessionType" rules={{ required: "Selecione o tipo de sessão." }} render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">Tipo de sessão</FormLabel>
                  <FormControl>
                    <select {...field} className={fieldClass} data-testid={`select-tipo-sessao-${team.id}`}>
                      <option value="principal">Principal</option>
                      <option value="transversal">Transversal</option>
                      <option value="externo">Externa</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="sessionDate" rules={{ required: "Informe a data da sessão." }} render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold">Data da sessão</FormLabel>
                  <FormControl><input {...field} type="date" className={fieldClass} data-testid={`input-data-sessao-${team.id}`} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="mentorId" rules={{ required: "Selecione o mentor que conduziu a sessão." }} render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel className="text-xs font-semibold">Mentor da sessão</FormLabel>
                  <FormControl>
                    <select {...field} className={fieldClass} data-testid={`select-mentor-sessao-${team.id}`}>
                      <option value="">Selecione um mentor</option>
                      {mentors.map((mentor) => <option key={mentor.id} value={mentor.id}>{mentor.name}</option>)}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {([
                ["teamNps", "NPS da equipe"],
                ["teamActionability", "Aplicabilidade para a equipe"],
                ["mentorCommitment", "Comprometimento do mentor"],
                ["mentorTraction", "Tração do mentor"],
              ] as const).map(([name, label]) => (
                <FormField key={name} control={form.control} name={name} rules={{ required: "Selecione uma nota." }} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">{label} (0–10)</FormLabel>
                    <FormControl>
                      <select {...field} className={fieldClass} data-testid={`select-${name}-sessao-${team.id}`}>
                        <option value="">Selecione uma nota</option>
                        {Array.from({ length: 11 }, (_, score) => <option key={score} value={score}>{score}</option>)}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {([
                ["teamFeedbackStrongPoints", "Pontos fortes observados"],
                ["teamFeedbackImprovements", "O que pode melhorar"],
                ["agreedNextSteps", "Próximos passos acordados"],
                ["mentorQualitativeAssessment", "Avaliação qualitativa do mentor"],
              ] as const).map(([name, label]) => (
                <FormField key={name} control={form.control} name={name} rules={{
                  validate: (value) => value.trim().length > 0 && value.trim().length <= 5000 || "Preencha o campo com até 5.000 caracteres.",
                }} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold">{label}</FormLabel>
                    <FormControl>
                      <textarea {...field} className={areaClass} maxLength={5000} data-testid={`textarea-${name}-${team.id}`} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ))}
            </div>
            {error && <p role="alert" className="text-xs text-destructive" data-testid={`erro-salvar-sessao-${team.id}`}>{error}</p>}
            <button type="submit" className={saveButton} disabled={create.isPending} data-testid={`button-salvar-sessao-${team.id}`}>
              {create.isPending ? "Salvando sessão…" : "Registrar sessão"}
            </button>
          </form>
        </Form>
      )}
    </section>
  );
}