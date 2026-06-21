import { Router } from "express";
import { groupStandings } from "../queries.js";

const router = Router();

router.get("/", (req, res) => res.json(groupStandings()));

export default router;
