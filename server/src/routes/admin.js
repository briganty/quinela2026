import { Router } from "express";
import { db, getSetting, setSetting } from "../db.js";
import { refreshResults } from "../services/footballApi.js";

const router = Router();

function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return res.status(403).json({ error: "admin disabled" });
  if (req.get("x-admin-token") !== token)
    return res.status(401).json({ error: "unauthorized" });
  next();
}

// Verify an admin token. Used by the UI to gate the editor.
router.get("/check", requireAdmin, (req, res) => res.json({ ok: true }));

// Upsert a single prediction. Body: { pool_match_id, player_id, pred_home, pred_away }
router.put("/predictions", requireAdmin, (req, res) => {
  const { pool_match_id, player_id, pred_home, pred_away } = req.body || {};
  const pmId = Number(pool_match_id);
  const plId = Number(player_id);
  if (!pmId || !plId) return res.status(400).json({ error: "bad ids" });

  const norm = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 99 ? n : NaN;
  };
  const h = norm(pred_home);
  const a = norm(pred_away);
  if (Number.isNaN(h) || Number.isNaN(a))
    return res.status(400).json({ error: "bad score" });

  // Validate the (pool_match, player) belongs to the same pool.
  const ok = db
    .prepare(
      `SELECT 1 FROM pool_matches pm
       JOIN players pl ON pl.pool_id = pm.pool_id
       WHERE pm.id = ? AND pl.id = ?`
    )
    .get(pmId, plId);
  if (!ok) return res.status(404).json({ error: "mismatch pool/player" });

  db.prepare(
    `INSERT INTO predictions (pool_match_id, player_id, pred_home, pred_away)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(pool_match_id, player_id)
     DO UPDATE SET pred_home=excluded.pred_home, pred_away=excluded.pred_away`
  ).run(pmId, plId, h, a);

  res.json({ ok: true });
});

// Create an announcement.
router.post("/announcements", requireAdmin, (req, res) => {
  const message = String(req.body?.message ?? "").trim();
  if (!message) return res.status(400).json({ error: "empty message" });
  if (message.length > 500) return res.status(400).json({ error: "too long" });
  const info = db
    .prepare("INSERT INTO announcements (message, created_at) VALUES (?, ?)")
    .run(message, new Date().toISOString());
  res.json({ id: info.lastInsertRowid, message, created_at: new Date().toISOString() });
});

// Read live settings. Sensitive values are masked.
router.get("/settings", requireAdmin, (req, res) => {
  const key = getSetting("football_api_key", process.env.FOOTBALL_API_KEY) || "";
  const masked = key
    ? key.slice(0, 4) + "•".repeat(Math.max(0, key.length - 8)) + key.slice(-4)
    : "";
  const provider = getSetting(
    "football_provider",
    process.env.FOOTBALL_PROVIDER || "football-data"
  );
  res.json({
    football_api_key_masked: masked,
    football_api_key_set: !!key,
    football_provider: provider,
  });
});

// Update settings. Body may contain football_api_key and/or football_provider.
router.put("/settings", requireAdmin, (req, res) => {
  const { football_api_key, football_provider } = req.body || {};
  if (football_api_key !== undefined) {
    setSetting("football_api_key", String(football_api_key));
  }
  if (football_provider !== undefined) {
    const p = String(football_provider);
    if (!["football-data", "api-sports", "espn"].includes(p))
      return res.status(400).json({ error: "unknown provider" });
    setSetting("football_provider", p);
  }
  res.json({ ok: true });
});

// Trigger a refresh and return the provider's result (handy from the UI).
router.post("/refresh", requireAdmin, async (req, res) => {
  res.json(await refreshResults());
});

// Delete an announcement.
router.delete("/announcements/:id", requireAdmin, (req, res) => {
  const info = db
    .prepare("DELETE FROM announcements WHERE id = ?")
    .run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

export default router;
