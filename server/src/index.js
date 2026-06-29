import express from "express";
import cron from "node-cron";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSeedIfEmpty, syncNewPools, syncNewPoolMatches } from "./db.js";
import poolsRouter from "./routes/pools.js";
import matchesRouter from "./routes/matches.js";
import groupsRouter from "./routes/groups.js";
import feedRouter from "./routes/feed.js";
import adminRouter from "./routes/admin.js";
import announcementsRouter from "./routes/announcements.js";
import { refreshResults } from "./services/footballApi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const seeded = loadSeedIfEmpty();
console.log(seeded ? "Database seeded from seed.json" : "Database already initialized");

// Add any new quiniela (pool) introduced in seed.json to an already-seeded DB.
const addedPools = syncNewPools();
if (addedPools.length) console.log("New pools added:", addedPools.join(", "));

// Backfill matches added to existing pools after seeding (e.g. knockout rounds).
const addedPM = syncNewPoolMatches();
if (addedPM) console.log(`Backfilled ${addedPM} pool match(es) into existing pools`);

const app = express();
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/pools", poolsRouter);
app.use("/api/matches", matchesRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/feed", feedRouter);
app.use("/api/admin", adminRouter);
app.use("/api/announcements", announcementsRouter);

// Manual trigger for the results refresh (handy for testing the integration).
app.post("/api/refresh", async (req, res) => {
  res.json(await refreshResults());
});

// Serve the built React app (production single-container setup).
const webDist = resolve(__dirname, "..", "..", "web", "dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(resolve(webDist, "index.html"));
  });
}

app.listen(PORT, () => console.log(`Quiniela server listening on :${PORT}`));

// Auto-update is always scheduled. refreshResults() short-circuits when no API
// key is configured (env or admin UI setting), so this is safe.
const schedule = process.env.POLL_CRON || "*/5 * * * *";
cron.schedule(schedule, async () => {
  const r = await refreshResults();
  console.log("[cron] refreshResults:", JSON.stringify(r));
});
console.log(`Auto-update scheduled (${schedule})`);
refreshResults().then((r) => console.log("[startup] refreshResults:", JSON.stringify(r)));
