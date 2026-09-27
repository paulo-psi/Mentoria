import { Router, type IRouter } from "express";
import healthRouter from "./health";
import teamsRouter from "./teams";

const router: IRouter = Router();

router.use(healthRouter);
router.use(teamsRouter);

export default router;
