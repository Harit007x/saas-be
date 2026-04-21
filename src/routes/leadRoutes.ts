import express from "express";
import { getLeads } from "../controllers/leadController";
import { protect } from "../middlewares/authMiddleware";

export const leadRouter = express.Router();

leadRouter.use(protect);
leadRouter.route("/").get(getLeads);
