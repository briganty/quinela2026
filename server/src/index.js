import express from "express";
import cron from "node-cron";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSeedIfEmpty } from "./db.js";
import poolsRouter from "./routes/pools.js";
import matchesRouter from "./routes/matches.js";
import adminRouter from "./routes/admin.js";
import announcementsRouter from "./routes/announcements.js";
import { refreshResults } from "./services/footballApi.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const seeded = loadSeedIfEmpty();
console.log(seeded ? "Database seeded from seed.json" : "Database already initialized");

const app = express();
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/pools", poolsRouter);
app.use("/api/matches", matchesRouter);
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

// Schedule automatic result updates (only active when FOOTBALL_API_KEY is set).
if (process.env.FOOTBALL_API_KEY) {
  const schedule = process.env.POLL_CRON || "*/10 * * * *";
  cron.schedule(schedule, async () => {
    const r = await refreshResults();
    console.log("[cron] refreshResults:", JSON.stringify(r));
  });
  console.log(`Auto-update scheduled (${schedule})`);
  refreshResults().then((r) => console.log("[startup] refreshResults:", JSON.stringify(r)));
} else {
  console.log("FOOTBALL_API_KEY not set — auto-update disabled (using seed/manual results)");
}
