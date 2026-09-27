import { Router, type IRouter } from "express";
import healthRouter from "./health";
import teamsRouter from "./teams";
import teamMaintenanceRouter from "./team-maintenance";
import studentsRouter from "./students";
import accessRouter from "./access";

const router: IRouter = Router();

router.use(healthRouter);
router.use(teamsRouter);
router.use(teamMaintenanceRouter);
router.use(studentsRouter);
router.use(accessRouter);

export default router;
