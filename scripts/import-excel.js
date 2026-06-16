// One-time importer: reads assets/EXCEL_MUNDIAL.xlsx and produces server/data/seed.json
// Run from the server/ folder via `npm run import`, or `node scripts/import-excel.js`.
import XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const XLSX_PATH = resolve(ROOT, "assets/EXCEL_MUNDIAL.xlsx");
const OUT_PATH = resolve(ROOT, "server/data/seed.json");

const wb = XLSX.readFile(XLSX_PATH);
const sheet = (name) =>
  XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" });

// --- helpers -------------------------------------------------------------
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

// ABU sheet uses some short/variant names; map them to canonical (normalized).
const TEAM_ALIASES = {
  "arabia saudi": "arabia saudita",
  bosnia: "bosnia y herzegovina",
  canada: "canada", // accent already stripped by norm()
};
const canonName = (raw) => {
  const n = norm(raw);
  return TEAM_ALIASES[n] || n;
};

const toInt = (v) => {
  const s = String(v).trim();
  if (s === "" || s === "-") return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
};

// "11/06/2026" + "13:00" -> "2026-06-11T13:00:00"
const toISO = (date, time) => {
  const d = String(date).trim();
  const t = String(time).trim() || "00:00";
  const m = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const hh = t.padStart(5, "0");
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${hh}:00`;
};

// --- GRUPOS: teams -------------------------------------------------------
const teams = [];
for (const row of sheet("GRUPOS")) {
  const group = String(row[0] || "").trim();
  if (!/^[A-L]$/.test(group)) continue;
  for (let c = 1; c <= 4; c++) {
    const name = String(row[c] || "").trim();
    if (name) teams.push({ name, group_code: group });
  }
}
const canonByName = new Map(teams.map((t) => [canonName(t.name), t.name]));

// --- Primera Fase: 72 canonical group matches ----------------------------
// SheetJS drops empty leading columns; data rows (0-based):
// 0 date, 1 time, 2 "Home vs Away", 3 stadium, 4 group, 5 home, 7 homeScore,
// 8 awayScore, 10 away. Detect rows by a real date in col 0 + group in col 4.
const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const matches = [];
for (const row of sheet("Primera Fase")) {
  const date = String(row[0] || "").trim();
  const group = String(row[4] || "").trim();
  const home = String(row[5] || "").trim();
  const away = String(row[10] || "").trim();
  if (!DATE_RE.test(date) || !/^[A-L]$/.test(group) || !home || !away) continue;
  const oh = toInt(row[7]);
  const oa = toInt(row[8]);
  matches.push({
    match_no: matches.length + 1,
    kickoff: toISO(date, row[1]),
    stadium: String(row[3] || "").trim(),
    group_code: group,
    phase: "GROUP",
    home_team: home,
    away_team: away,
    official_home: oh,
    official_away: oa,
    status: oh !== null && oa !== null ? "FINISHED" : "SCHEDULED",
  });
}

// index canonical matches by unordered normalized team pair
const matchByPair = new Map();
for (const m of matches) {
  const key = [canonName(m.home_team), canonName(m.away_team)].sort().join("|");
  if (!matchByPair.has(key)) matchByPair.set(key, []);
  matchByPair.get(key).push(m);
}

// --- pools ---------------------------------------------------------------
const pools = [{ name: "CASA" }, { name: "ABU" }];
const players = [];
const poolMatches = [];
const predictions = [];

// CASA: 4 players, 72 matches in fixture order (1:1 with canonical).
// Data rows (0-based): 0 date, 2 home, 3 away, 4/5 official, then per player
// (home, away, pts): Sammy 6/7, Tasha 9/10, Tony 12/13, Eduardo 15/16.
{
  const rows = sheet("Quiniela CASA");
  const casaPlayers = [
    { name: "Sammy", h: 6, a: 7 },
    { name: "Tasha", h: 9, a: 10 },
    { name: "Tony", h: 12, a: 13 },
    { name: "Eduardo", h: 15, a: 16 },
  ];
  casaPlayers.forEach((p, i) =>
    players.push({ pool: "CASA", name: p.name, order: i })
  );
  let pos = 0;
  for (const row of rows) {
    const date = String(row[0] || "").trim();
    const home = String(row[2] || "").trim();
    const away = String(row[3] || "").trim();
    if (!DATE_RE.test(date) || !home || !away) continue;
    pos += 1;
    const canonical = matches[pos - 1]; // same order as Primera Fase
    poolMatches.push({
      pool: "CASA",
      position: pos,
      home_team: canonical ? canonical.home_team : home,
      away_team: canonical ? canonical.away_team : away,
      match_no: canonical ? canonical.match_no : null,
      reversed: 0,
    });
    for (const p of casaPlayers) {
      const ph = toInt(row[p.h]);
      const pa = toInt(row[p.a]);
      if (ph === null && pa === null) continue;
      predictions.push({
        pool: "CASA",
        position: pos,
        player: p.name,
        pred_home: ph,
        pred_away: pa,
      });
    }
  }
}

// ABU: 6 players, hand-picked matches given as "Home vs Away" strings.
// Data rows (0-based): 0 label, 1/2 official, then per player (home, away, pts):
// Sammy 3/4, Tasha 6/7, Tony 9/10, Nury 12/13, Abu 15/16, Jared 18/19.
{
  const rows = sheet("Quiniela ABU");
  const abuPlayers = [
    { name: "Sammy", h: 3, a: 4 },
    { name: "Tasha", h: 6, a: 7 },
    { name: "Tony", h: 9, a: 10 },
    { name: "Nury", h: 12, a: 13 },
    { name: "Abu", h: 15, a: 16 },
    { name: "Jared", h: 18, a: 19 },
  ];
  abuPlayers.forEach((p, i) =>
    players.push({ pool: "ABU", name: p.name, order: i })
  );
  let pos = 0;
  let unmapped = [];
  for (const row of rows) {
    const label = String(row[0] || "").trim();
    if (!label.includes(" vs ")) continue;
    const [rawHome, rawAway] = label.split(" vs ").map((s) => s.trim());
    pos += 1;
    // resolve canonical match by team pair
    const key = [canonName(rawHome), canonName(rawAway)].sort().join("|");
    const candidates = matchByPair.get(key) || [];
    let matchNo = null;
    let reversed = 0;
    if (candidates.length >= 1) {
      const c = candidates[0];
      matchNo = c.match_no;
      reversed = canonName(c.home_team) === canonName(rawHome) ? 0 : 1;
    } else {
      unmapped.push(label);
    }
    poolMatches.push({
      pool: "ABU",
      position: pos,
      home_team: canonByName.get(canonName(rawHome)) || rawHome,
      away_team: canonByName.get(canonName(rawAway)) || rawAway,
      match_no: matchNo,
      reversed,
    });
    for (const p of abuPlayers) {
      const ph = toInt(row[p.h]);
      const pa = toInt(row[p.a]);
      if (ph === null && pa === null) continue;
      predictions.push({
        pool: "ABU",
        position: pos,
        player: p.name,
        pred_home: ph,
        pred_away: pa,
      });
    }
  }
  if (unmapped.length) {
    console.warn("WARN: ABU rows not mapped to a canonical match:", unmapped);
  }
}

const seed = { teams, matches, pools, players, pool_matches: poolMatches, predictions };
writeFileSync(OUT_PATH, JSON.stringify(seed, null, 2));

console.log("Seed written to", OUT_PATH);
console.log({
  teams: teams.length,
  matches: matches.length,
  finished: matches.filter((m) => m.status === "FINISHED").length,
  players: players.length,
  pool_matches: poolMatches.length,
  predictions: predictions.length,
  casa_pool_matches: poolMatches.filter((p) => p.pool === "CASA").length,
  abu_pool_matches: poolMatches.filter((p) => p.pool === "ABU").length,
});
