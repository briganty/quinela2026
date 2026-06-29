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

// Admin: set a match's team names by hand (e.g. fill knockout teams as they
// qualify when the data provider doesn't). Body: { home, away } in canonical
// orientation. Empty/blank values leave that side unchanged.
router.put("/:id/teams", (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return res.status(403).json({ error: "admin disabled" });
  if (req.get("x-admin-token") !== token)
    return res.status(401).json({ error: "unauthorized" });

  const norm = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const home = norm(req.body?.home);
  const away = norm(req.body?.away);
  if (!home && !away) return res.status(400).json({ error: "no names" });

  const cur = db
    .prepare("SELECT home_team, away_team FROM matches WHERE id=?")
    .get(Number(req.params.id));
  if (!cur) return res.status(404).json({ error: "not found" });

  db.prepare(
    "UPDATE matches SET home_team=?, away_team=?, updated_at=? WHERE id=?"
  ).run(
    home || cur.home_team,
    away || cur.away_team,
    new Date().toISOString(),
    Number(req.params.id)
  );
  res.json({ ok: true });
});

export default router;
