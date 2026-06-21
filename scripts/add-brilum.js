// One-shot: add the "Brilum" quiniela (a third pool) to server/data/seed.json
// from the "Quiniela Brilum" sheet of assets/EXCEL_MUNDIAL_1-2.xlsx.
//
// Like ABU, Brilum hand-picks matches given as Home/Away pairs; each row is
// linked to its canonical group match (already in seed.json) by team pair so
// official results flow in automatically. Idempotent: re-running replaces any
// previous Brilum entries.
//
//   node scripts/add-brilum.js
import XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const XLSX_PATH = resolve(ROOT, "assets/EXCEL_MUNDIAL_1-2.xlsx");
const SEED_PATH = resolve(ROOT, "server/data/seed.json");
const SHEET = "Quiniela Brilum";
const POOL = "Brilum";

// --- helpers (same normalization rules as import-excel.js) ---------------
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

const TEAM_ALIASES = {
  "arabia saudi": "arabia saudita",
  bosnia: "bosnia y herzegovina",
};
const canon = (raw) => {
  const n = norm(raw);
  return TEAM_ALIASES[n] || n;
};

const toInt = (v) => {
  const s = String(v).trim();
  if (s === "" || s === "-") return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
};

const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

// --- read seed + canonical group matches ---------------------------------
const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
const canonByName = new Map(seed.teams.map((t) => [canon(t.name), t.name]));
const groupByPair = new Map(); // unordered pair -> canonical match
for (const m of seed.matches) {
  if (m.phase !== "GROUP") continue;
  const key = [canon(m.home_team), canon(m.away_team)].sort().join("|");
  groupByPair.set(key, m);
}

// --- parse the Brilum sheet ----------------------------------------------
const wb = XLSX.readFile(XLSX_PATH);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], {
  header: 1,
  raw: false,
  defval: "",
});

// Header: 0 date, 1 time, 2 home, 3 away, 4/5 official result, then per player
// (home, away, pts): EDUARDO 6/7, Andri 9/10, Emi 12/13.
const brilumPlayers = [
  { name: "Eduardo", h: 6, a: 7 },
  { name: "Andri", h: 9, a: 10 },
  { name: "Emi", h: 12, a: 13 },
];

const players = brilumPlayers.map((p, i) => ({
  pool: POOL,
  name: p.name,
  order: i,
}));
const poolMatches = [];
const predictions = [];
const unmapped = [];

let pos = 0;
for (const row of rows) {
  const date = String(row[0] || "").trim();
  const rawHome = String(row[2] || "").trim();
  const rawAway = String(row[3] || "").trim();
  if (!DATE_RE.test(date) || !rawHome || !rawAway) continue;
  pos += 1;

  const key = [canon(rawHome), canon(rawAway)].sort().join("|");
  const c = groupByPair.get(key);
  let matchNo = null;
  let reversed = 0;
  if (c) {
    matchNo = c.match_no;
    reversed = canon(c.home_team) === canon(rawHome) ? 0 : 1;
  } else {
    unmapped.push(`${rawHome} vs ${rawAway}`);
  }

  poolMatches.push({
    pool: POOL,
    position: pos,
    home_team: canonByName.get(canon(rawHome)) || rawHome,
    away_team: canonByName.get(canon(rawAway)) || rawAway,
    match_no: matchNo,
    reversed,
  });

  for (const p of brilumPlayers) {
    const ph = toInt(row[p.h]);
    const pa = toInt(row[p.a]);
    if (ph === null && pa === null) continue;
    predictions.push({
      pool: POOL,
      position: pos,
      player: p.name,
      pred_home: ph,
      pred_away: pa,
    });
  }
}

// --- merge into seed.json (idempotent: drop any previous Brilum) ----------
seed.pools = seed.pools.filter((p) => p.name !== POOL).concat({ name: POOL });
seed.players = seed.players.filter((p) => p.pool !== POOL).concat(players);
seed.pool_matches = seed.pool_matches
  .filter((p) => p.pool !== POOL)
  .concat(poolMatches);
seed.predictions = seed.predictions
  .filter((p) => p.pool !== POOL)
  .concat(predictions);

writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));

if (unmapped.length) {
  console.warn("WARN: Brilum rows not mapped to a canonical match:", unmapped);
}
console.log("Brilum pool added to", SEED_PATH);
console.log({
  players: players.length,
  pool_matches: poolMatches.length,
  predictions: predictions.length,
  unmapped: unmapped.length,
});
