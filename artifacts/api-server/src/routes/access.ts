import { asc } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetAccessPermissionsResponse, GetMentorsResponse } from "@workspace/api-zod";
import { db, mentorsTable } from "@workspace/db";
import { isAdministrator, requireApprovedUser } from "../middlewares/requireApprovedUser";

const router: IRouter = Router();

router.get("/access", requireApprovedUser, (_req, res): void => {
  const email = res.locals.approvedEmail;
  res.json(GetAccessPermissionsResponse.parse({
    canManage: typeof email === "string" && isAdministrator(email),
  }));
});

router.get("/mentors", requireApprovedUser, async (_req, res): Promise<void> => {
  const mentors = await db
    .select({ id: mentorsTable.id, name: mentorsTable.name })
    .from(mentorsTable)
    .orderBy(asc(mentorsTable.name));
  res.json(GetMentorsResponse.parse(mentors));
});

export default router;