import express from "express";
import { getMonitors, createMonitor, toggleMonitor, scrapeMonitorNow, getMonitorRuns } from "../controllers/monitorController";
import { protect } from "../middlewares/authMiddleware";

export const monitorRouter = express.Router();

monitorRouter.use(protect);
monitorRouter.route("/").get(getMonitors).post(createMonitor);
monitorRouter.route("/:id/toggle").patch(toggleMonitor);
monitorRouter.route("/:id/scrape").post(scrapeMonitorNow);
monitorRouter.route("/:id/runs").get(getMonitorRuns);
