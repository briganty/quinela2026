import { Router } from "express";
import { listPools, standings, grid } from "../queries.js";

const router = Router();

router.get("/", (req, res) => res.json(listPools()));

router.get("/:id/standings", (req, res) => {
  res.json(standings(Number(req.params.id)));
});

router.get("/:id/grid", (req, res) => {
  res.json(grid(Number(req.params.id)));
});

export default router;
