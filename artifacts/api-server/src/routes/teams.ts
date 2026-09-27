import { Router, type IRouter } from "express";
import { GetTeamsResponse } from "@workspace/api-zod";
import { requireApprovedUser } from "../middlewares/requireApprovedUser";
import { readTeams } from "../lib/team-read";

const router: IRouter = Router();

router.get("/teams", requireApprovedUser, async (_req, res): Promise<void> => {
  res.json(GetTeamsResponse.parse(await readTeams()));
});

export default router;