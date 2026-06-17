import { Router } from "express";
import { db } from "../db.js";

const router = Router();

router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT id, message, created_at FROM announcements ORDER BY id DESC")
    .all();
  res.json(rows);
});

export default router;
