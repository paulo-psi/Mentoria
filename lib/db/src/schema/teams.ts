import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mentorsTable } from "./mentors";

export const teamsTable = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    pitchSummary: text("pitch_summary"),
    mainMentorId: integer("main_mentor_id").notNull().references(() => mentorsTable.id, { onDelete: "restrict" }),
    currentStage: text("current_stage"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("teams_main_mentor_id_idx").on(table.mainMentorId)],
);

export const insertTeamSchema = createInsertSchema(teamsTable, {
  name: z.string().trim().min(1),
  pitchSummary: z.string().trim().min(1).nullable(),
  currentStage: z.string().trim().min(1).nullable(),
}).omit({ id: true, createdAt: true });

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;