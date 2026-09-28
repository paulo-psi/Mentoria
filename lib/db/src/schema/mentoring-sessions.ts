import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mentorsTable } from "./mentors";
import { teamsTable } from "./teams";

export const mentoringSessionsTable = pgTable(
  "mentoring_sessions",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
    mentorId: integer("mentor_id").notNull().references(() => mentorsTable.id, { onDelete: "restrict" }),
    sessionType: text("session_type").notNull(),
    sessionDate: date("session_date", { mode: "string" }).notNull(),
    teamNps: integer("team_nps").notNull(),
    teamActionability: integer("team_actionability").notNull(),
    mentorCommitment: integer("mentor_commitment").notNull(),
    mentorTraction: integer("mentor_traction").notNull(),
    teamFeedbackStrongPoints: text("team_feedback_strong_points").notNull(),
    teamFeedbackImprovements: text("team_feedback_improvements").notNull(),
    agreedNextSteps: text("agreed_next_steps").notNull(),
    mentorQualitativeAssessment: text("mentor_qualitative_assessment").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_team_id_idx").on(table.teamId),
    index("sessions_mentor_id_idx").on(table.mentorId),
    check("sessions_type_valid", sql`${table.sessionType} in ('principal', 'transversal', 'externo')`),
    check("sessions_team_nps_range", sql`${table.teamNps} between 0 and 10`),
    check("sessions_team_actionability_range", sql`${table.teamActionability} between 0 and 10`),
    check("sessions_mentor_commitment_range", sql`${table.mentorCommitment} between 0 and 10`),
    check("sessions_mentor_traction_range", sql`${table.mentorTraction} between 0 and 10`),
  ],
);

const score = z.number().int().min(0).max(10);
const completeFeedback = z.string().trim().min(1).max(5000);

export const insertMentoringSessionSchema = createInsertSchema(mentoringSessionsTable, {
  sessionType: z.enum(["principal", "transversal", "externo"]),
  sessionDate: z.iso.date(),
  teamNps: score,
  teamActionability: score,
  mentorCommitment: score,
  mentorTraction: score,
  teamFeedbackStrongPoints: completeFeedback,
  teamFeedbackImprovements: completeFeedback,
  agreedNextSteps: completeFeedback,
  mentorQualitativeAssessment: completeFeedback,
}).omit({ id: true, createdAt: true });

export type InsertMentoringSession = z.infer<typeof insertMentoringSessionSchema>;
export type MentoringSession = typeof mentoringSessionsTable.$inferSelect;