import { Router } from "express";
import { db } from "../db.js";
import { listMatches } from "../queries.js";

const router = Router();

router.get("/", (req, res) => res.json(listMatches()));

// Admin fallback to set/correct an official result by hand.
// Protected by ADMIN_TOKEN (header `x-admin-token`); disabled if unset.
router.put("/:id/result", (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return res.status(403).json({ error: "admin disabled" });
  if (req.get("x-admin-token") !== token)
    return res.status(401).json({ error: "unauthorized" });

  const { home, away, status } = req.body || {};
  const h = home === null ? null : Number(home);
  const a = away === null ? null : Number(away);
  if (h !== null && Number.isNaN(h)) return res.status(400).json({ error: "bad home" });
  if (a !== null && Number.isNaN(a)) return res.status(400).json({ error: "bad away" });

  const info = db
    .prepare(
      `UPDATE matches SET official_home=?, official_away=?,
        status=?, updated_at=? WHERE id=?`
    )
    .run(
      h,
      a,
      status || (h != null && a != null ? "FINISHED" : "SCHEDULED"),
      new Date().toISOString(),
      Number(req.params.id)
    );
  if (info.changes === 0) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

export default router;
