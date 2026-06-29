// One-shot: add the knockout matches (R32 -> Final, match_no 73..104) as
// pool_matches to the given pools, so they show up in the prediction grid and
// the admin can capture knockout predictions. Team names are the bracket
// placeholders already on each match ("2° A", "Ganador 73", ...) and get
// overwritten by the data provider as teams qualify.
//
// Idempotent: a pool that already has a given knockout match is left untouched.
// Patches seed.json and, if present, the live DB.
//
// Usage:
//   node scripts/add-ko-pools.mjs                 # pools below, default
//   POOLS="CASA,ABU" node scripts/add-ko-pools.mjs
//   DB_PATH=/data/quiniela.db node scripts/add-ko-pools.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SEED_PATH = resolve(ROOT, "server", "data", "seed.json");
const DB_PATH = process.env.DB_PATH || resolve(ROOT, "server", "data", "quiniela.db");

const POOLS = (process.env.POOLS || "CASA,ABU,Brilum")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const KO_PHASES = new Set(["R32", "R16", "QF", "SF", "3RD", "FINAL"]);

const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));

// Knockout matches in bracket order, with their placeholder team names.
const ko = seed.matches
  .filter((m) => KO_PHASES.has(m.phase))
  .sort((a, b) => a.match_no - b.match_no);

// --- Patch seed.json ---
let added = 0;
const log = [];
for (const pool of POOLS) {
  const have = seed.pool_matches.filter((pm) => pm.pool === pool);
  const haveNos = new Set(have.map((pm) => pm.match_no));
  let pos = have.reduce((mx, pm) => Math.max(mx, pm.position), 0);
  let n = 0;
  for (const m of ko) {
    if (haveNos.has(m.match_no)) continue;
    seed.pool_matches.push({
      pool,
      position: ++pos,
      home_team: m.home_team,
      away_team: m.away_team,
      match_no: m.match_no,
      reversed: 0,
    });
    added++;
    n++;
  }
  log.push(`${pool}: +${n} eliminatorias (posiciones hasta ${pos})`);
}
writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2) + "\n");
console.log(log.join("\n"));
console.log(`seed.json: ${added} pool_match(es) agregadas.`);

// --- Patch an existing DB ---
if (existsSync(DB_PATH)) {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(DB_PATH);
  const poolIdByName = new Map(
    db.prepare("SELECT id, name FROM pools").all().map((r) => [r.name, r.id])
  );
  const matchIdByNo = new Map(
    db.prepare("SELECT id, match_no FROM matches").all().map((r) => [r.match_no, r.id])
  );
  const maxPos = db.prepare(
    "SELECT COALESCE(MAX(position),0) AS p FROM pool_matches WHERE pool_id=?"
  );
  const hasMatch = db.prepare(
    "SELECT 1 FROM pool_matches WHERE pool_id=? AND match_id=?"
  );
  const ins = db.prepare(
    `INSERT INTO pool_matches (pool_id, position, home_team, away_team, match_id, reversed)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  let dbAdded = 0;
  const tx = db.transaction(() => {
    for (const pool of POOLS) {
      const pid = poolIdByName.get(pool);
      if (!pid) {
        console.log(`(DB) pool "${pool}" no existe, omitido`);
        continue;
      }
      let pos = maxPos.get(pid).p;
      for (const m of ko) {
        const mid = matchIdByNo.get(m.match_no);
        if (!mid || hasMatch.get(pid, mid)) continue;
        ins.run(pid, ++pos, m.home_team, m.away_team, mid, 0);
        dbAdded++;
      }
    }
  });
  tx();
  console.log(`DB ${DB_PATH}: ${dbAdded} pool_match(es) insertadas.`);
} else {
  console.log(`No DB at ${DB_PATH} (fresh installs seed from seed.json).`);
}
