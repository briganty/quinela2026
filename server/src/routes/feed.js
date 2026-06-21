import { Router } from "express";
import { liveFeed } from "../queries.js";

const router = Router();

router.get("/", (req, res) => res.json(liveFeed()));

export default router;
