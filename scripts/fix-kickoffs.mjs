// One-shot: set the real FIFA World Cup 2026 kickoff times (and knockout venues)
// for every match. Kickoffs are stored in Costa Rica local time (UTC-6, no DST),
// matching the convention documented in server/src/queries.js.
//
// Source: official FIFA 2026 match schedule. Each slot below is the kickoff in
// US Eastern Time (ET = UTC-4 in June/July); Costa Rica time = ET - 2h.
//
// What it fixes vs. the previous seed:
//   - Group stage: 5 wrong times (the Jun 19 cluster + M51).
//   - Knockouts: all kickoffs were placeholder 19:00; QF dates were compressed
//     into Jul 9-10 (real: Jul 9, 10, 11, 11); Round-of-16 venues were guesses.
// The "Ganador N" placeholders are left untouched: the football-data sync
// overwrites knockout teams/scores by chronological order per phase, so getting
// the times (ordering) and venues right is what makes that mapping correct.
//
// Usage:
//   node scripts/fix-kickoffs.mjs            # patch seed.json (+ DB if present)
//   DB_PATH=/data/quiniela.db node scripts/fix-kickoffs.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SEED_PATH = resolve(ROOT, "server", "data", "seed.json");
const DB_PATH = process.env.DB_PATH || resolve(ROOT, "server", "data", "quiniela.db");

// match_no -> [MM-DD (ET date), HH:MM (ET, 24h)]. ET -> Costa Rica = -2h.
const ET = {
  1: ["06-11", "15:00"], 2: ["06-11", "22:00"], 3: ["06-12", "15:00"], 4: ["06-12", "21:00"],
  5: ["06-13", "15:00"], 6: ["06-13", "18:00"], 7: ["06-13", "21:00"], 8: ["06-14", "00:00"],
  9: ["06-14", "13:00"], 10: ["06-14", "16:00"], 11: ["06-14", "19:00"], 12: ["06-14", "22:00"],
  13: ["06-15", "12:00"], 14: ["06-15", "15:00"], 15: ["06-15", "18:00"], 16: ["06-15", "21:00"],
  17: ["06-16", "15:00"], 18: ["06-16", "18:00"], 19: ["06-16", "21:00"], 20: ["06-17", "00:00"],
  21: ["06-17", "13:00"], 22: ["06-17", "16:00"], 23: ["06-17", "19:00"], 24: ["06-17", "22:00"],
  25: ["06-18", "12:00"], 26: ["06-18", "15:00"], 27: ["06-18", "18:00"], 28: ["06-18", "21:00"],
  29: ["06-19", "00:00"], 30: ["06-19", "15:00"], 31: ["06-19", "18:00"], 32: ["06-19", "20:30"],
  33: ["06-20", "13:00"], 34: ["06-20", "16:00"], 35: ["06-20", "20:00"], 36: ["06-21", "00:00"],
  37: ["06-21", "12:00"], 38: ["06-21", "15:00"], 39: ["06-21", "18:00"], 40: ["06-21", "21:00"],
  41: ["06-22", "13:00"], 42: ["06-22", "17:00"], 43: ["06-22", "20:00"], 44: ["06-22", "23:00"],
  45: ["06-23", "13:00"], 46: ["06-23", "16:00"], 47: ["06-23", "19:00"], 48: ["06-23", "22:00"],
  49: ["06-24", "15:00"], 50: ["06-24", "15:00"], 51: ["06-24", "18:00"], 52: ["06-24", "18:00"],
  53: ["06-24", "21:00"], 54: ["06-24", "21:00"], 55: ["06-25", "16:00"], 56: ["06-25", "16:00"],
  57: ["06-25", "19:00"], 58: ["06-25", "19:00"], 59: ["06-25", "22:00"], 60: ["06-25", "22:00"],
  61: ["06-26", "15:00"], 62: ["06-26", "15:00"], 63: ["06-26", "20:00"], 64: ["06-26", "20:00"],
  65: ["06-26", "23:00"], 66: ["06-26", "23:00"], 67: ["06-27", "17:00"], 68: ["06-27", "17:00"],
  69: ["06-27", "19:30"], 70: ["06-27", "19:30"], 71: ["06-27", "22:00"], 72: ["06-27", "22:00"],
  // Round of 32
  73: ["06-28", "15:00"], 74: ["06-29", "16:30"], 75: ["06-29", "21:00"], 76: ["06-29", "13:00"],
  77: ["06-30", "17:00"], 78: ["06-30", "13:00"], 79: ["06-30", "21:00"], 80: ["07-01", "12:00"],
  81: ["07-01", "20:00"], 82: ["07-01", "16:00"], 83: ["07-02", "19:00"], 84: ["07-02", "15:00"],
  85: ["07-02", "23:00"], 86: ["07-03", "18:00"], 87: ["07-03", "21:30"], 88: ["07-03", "14:00"],
  // Round of 16
  89: ["07-04", "17:00"], 90: ["07-04", "13:00"], 91: ["07-05", "16:00"], 92: ["07-05", "20:00"],
  93: ["07-06", "15:00"], 94: ["07-06", "20:00"], 95: ["07-07", "12:00"], 96: ["07-07", "16:00"],
  // Quarter-finals
  97: ["07-09", "16:00"], 98: ["07-10", "15:00"], 99: ["07-11", "17:00"], 100: ["07-11", "21:00"],
  // Semis / third place / final
  101: ["07-14", "15:00"], 102: ["07-15", "15:00"], 103: ["07-18", "17:00"], 104: ["07-19", "15:00"],
};

// Round-of-16 venues were placeholders in the old seed. Real FIFA venues, in the
// bare-city style used by the rest of the knockout rows.
const VENUE = {
  90: "Houston",
  91: "Nueva York/NJ",
  92: "Ciudad de México",
  93: "Dallas",
  94: "Seattle",
  95: "Atlanta",
};

// ET wall-clock -> Costa Rica wall-clock (naive ISO, no zone), shifting -2h and
// rolling the date over when needed (e.g. a 00:00 ET game is 22:00 the day before).
function toCR(mmdd, hhmm) {
  const dt = new Date(`2026-${mmdd}T${hhmm}:00Z`);
  dt.setUTCHours(dt.getUTCHours() - 2);
  return dt.toISOString().slice(0, 19);
}

const wantKickoff = {};
const wantVenue = {};
for (const [no, [mmdd, hhmm]] of Object.entries(ET)) wantKickoff[no] = toCR(mmdd, hhmm);
for (const [no, v] of Object.entries(VENUE)) wantVenue[no] = v;

// --- Patch seed.json ---
const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
let kChanged = 0;
let vChanged = 0;
const log = [];
for (const m of seed.matches) {
  const k = wantKickoff[m.match_no];
  if (k && k !== m.kickoff) {
    log.push(`M${m.match_no}: ${m.kickoff} -> ${k}`);
    m.kickoff = k;
    kChanged++;
  }
  const v = wantVenue[m.match_no];
  if (v && v !== m.stadium) {
    log.push(`M${m.match_no}: venue ${JSON.stringify(m.stadium)} -> ${JSON.stringify(v)}`);
    m.stadium = v;
    vChanged++;
  }
}
writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2) + "\n");
console.log(log.join("\n"));
console.log(`seed.json: ${kChanged} kickoff(s), ${vChanged} venue(s) updated.`);

// --- Patch an existing DB, if any (production runs on a persistent volume) ---
if (existsSync(DB_PATH)) {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(DB_PATH);
  const upK = db.prepare("UPDATE matches SET kickoff=? WHERE match_no=?");
  const upV = db.prepare("UPDATE matches SET stadium=? WHERE match_no=?");
  let dk = 0;
  let dv = 0;
  const tx = db.transaction(() => {
    for (const [no, k] of Object.entries(wantKickoff)) dk += upK.run(k, Number(no)).changes;
    for (const [no, v] of Object.entries(wantVenue)) dv += upV.run(v, Number(no)).changes;
  });
  tx();
  console.log(`DB ${DB_PATH}: ${dk} kickoff row(s), ${dv} venue row(s) touched.`);
} else {
  console.log(`No DB at ${DB_PATH} (fresh installs seed from seed.json).`);
}
