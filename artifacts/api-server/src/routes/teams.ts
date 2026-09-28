import { Router, type IRouter } from "express";
import { GetTeamsResponse } from "@workspace/api-zod";
import { requireApprovedUser } from "../middlewares/requireApprovedUser";
import { readTeams } from "../lib/team-read";

const router: IRouter = Router();

router.get("/teams", requireApprovedUser, async (_req, res): Promise<void> => {
  const teams = await readTeams();
  // Validate the date-only contract but return the original YYYY-MM-DD strings; Zod coerces format: date to Date.
  GetTeamsResponse.parse(teams);
  res.json(teams);
});

export default router;