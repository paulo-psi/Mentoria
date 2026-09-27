import { Router, type IRouter } from "express";
import healthRouter from "./health";
import teamsRouter from "./teams";
import teamMaintenanceRouter from "./team-maintenance";
import studentsRouter from "./students";
import accessRouter from "./access";
import rosterAuditRouter from "./roster-audit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(teamsRouter);
router.use(teamMaintenanceRouter);
router.use(studentsRouter);
router.use(accessRouter);
router.use(rosterAuditRouter);

export default router;
