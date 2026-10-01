import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Deliberately no foreign keys: deleted roster records must remain searchable.
export const rosterAuditTable = pgTable("roster_audit", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id"),
  studentId: integer("student_id"),
  mentorId: integer("mentor_id"),
  action: text("action").notNull(),
  actorEmail: text("actor_email").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("roster_audit_team_id_idx").on(table.teamId, table.id),
  index("roster_audit_student_id_idx").on(table.studentId, table.id),
  index("roster_audit_mentor_id_idx").on(table.mentorId, table.id),
]);

export const insertRosterAuditSchema = createInsertSchema(rosterAuditTable).omit({ id: true, createdAt: true });
export type RosterAudit = typeof rosterAuditTable.$inferSelect;