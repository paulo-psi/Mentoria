import { index, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { teamsTable } from "./teams";

export const studentsTable = pgTable(
  "students",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    index("students_team_id_idx").on(table.teamId),
    uniqueIndex("students_team_sort_order_unique").on(table.teamId, table.sortOrder),
  ],
);

export const insertStudentSchema = createInsertSchema(studentsTable, {
  name: z.string().trim().min(1),
  sortOrder: z.number().int().min(0),
}).omit({ id: true });

export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof studentsTable.$inferSelect;