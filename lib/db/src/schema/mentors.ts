import { sql } from "drizzle-orm";
import { check, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mentorsTable = pgTable(
  "mentors",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    expertiseArea: text("expertise_area").notNull(),
    mentorType: text("mentor_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("mentors_type_valid", sql`${table.mentorType} in ('interno', 'externo')`),
  ],
);

export const insertMentorSchema = createInsertSchema(mentorsTable, {
  name: z.string().trim().min(1),
  email: z.email(),
  expertiseArea: z.string().trim().min(1),
  mentorType: z.enum(["interno", "externo"]),
}).omit({ id: true, createdAt: true });

export type InsertMentor = z.infer<typeof insertMentorSchema>;
export type Mentor = typeof mentorsTable.$inferSelect;