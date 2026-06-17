import Database from "better-sqlite3";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const DB_PATH = process.env.DB_PATH || resolve(DATA_DIR, "quiniela.db");
const SEED_PATH = resolve(DATA_DIR, "seed.json");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      name TEXT PRIMARY KEY,
      group_code TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY,
      match_no INTEGER UNIQUE NOT NULL,
      kickoff TEXT,
      stadium TEXT,
      group_code TEXT,
      phase TEXT,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      official_home INTEGER,
      official_away INTEGER,
      status TEXT DEFAULT 'SCHEDULED',
      provider_fixture_id TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS pools (
      id INTEGER PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY,
      pool_id INTEGER NOT NULL REFERENCES pools(id),
      name TEXT NOT NULL,
      display_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS pool_matches (
      id INTEGER PRIMARY KEY,
      pool_id INTEGER NOT NULL REFERENCES pools(id),
      position INTEGER NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      match_id INTEGER REFERENCES matches(id),
      reversed INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS predictions (
      pool_match_id INTEGER NOT NULL REFERENCES pool_matches(id),
      player_id INTEGER NOT NULL REFERENCES players(id),
      pred_home INTEGER,
      pred_away INTEGER,
      PRIMARY KEY (pool_match_id, player_id)
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

// Read a runtime-overridable setting. DB wins; falls back to the env var.
export function getSetting(key, envFallback) {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
    if (row && row.value !== "" && row.value != null) return row.value;
  } catch {
    // settings table may not exist yet during very first migration call
  }
  return envFallback;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`
  ).run(key, value == null ? "" : String(value));
}

function isEmpty() {
  return db.prepare("SELECT COUNT(*) AS n FROM matches").get().n === 0;
}

export function loadSeedIfEmpty() {
  migrate();
  if (!isEmpty()) return false;
  if (!existsSync(SEED_PATH)) {
    throw new Error(`Seed file not found at ${SEED_PATH}. Run the import script.`);
  }
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const tx = db.transaction(() => {
    const insTeam = db.prepare(
      "INSERT INTO teams (name, group_code) VALUES (?, ?)"
    );
    for (const t of seed.teams) insTeam.run(t.name, t.group_code);

    const insMatch = db.prepare(`INSERT INTO matches
      (match_no, kickoff, stadium, group_code, phase, home_team, away_team,
       official_home, official_away, status)
      VALUES (@match_no,@kickoff,@stadium,@group_code,@phase,@home_team,@away_team,
              @official_home,@official_away,@status)`);
    const matchIdByNo = new Map();
    for (const m of seed.matches) {
      const info = insMatch.run(m);
      matchIdByNo.set(m.match_no, info.lastInsertRowid);
    }

    const insPool = db.prepare("INSERT INTO pools (name) VALUES (?)");
    const poolIdByName = new Map();
    for (const p of seed.pools)
      poolIdByName.set(p.name, insPool.run(p.name).lastInsertRowid);

    const insPlayer = db.prepare(
      "INSERT INTO players (pool_id, name, display_order) VALUES (?, ?, ?)"
    );
    const playerId = new Map(); // `${pool}#${name}` -> id
    for (const pl of seed.players) {
      const id = insPlayer.run(
        poolIdByName.get(pl.pool),
        pl.name,
        pl.order ?? 0
      ).lastInsertRowid;
      playerId.set(`${pl.pool}#${pl.name}`, id);
    }

    const insPM = db.prepare(`INSERT INTO pool_matches
      (pool_id, position, home_team, away_team, match_id, reversed)
      VALUES (?, ?, ?, ?, ?, ?)`);
    const pmId = new Map(); // `${pool}#${position}` -> id
    for (const pm of seed.pool_matches) {
      const id = insPM.run(
        poolIdByName.get(pm.pool),
        pm.position,
        pm.home_team,
        pm.away_team,
        pm.match_no != null ? matchIdByNo.get(pm.match_no) : null,
        pm.reversed ? 1 : 0
      ).lastInsertRowid;
      pmId.set(`${pm.pool}#${pm.position}`, id);
    }

    const insPred = db.prepare(`INSERT INTO predictions
      (pool_match_id, player_id, pred_home, pred_away) VALUES (?, ?, ?, ?)`);
    for (const pr of seed.predictions) {
      insPred.run(
        pmId.get(`${pr.pool}#${pr.position}`),
        playerId.get(`${pr.pool}#${pr.player}`),
        pr.pred_home,
        pr.pred_away
      );
    }
  });
  tx();
  return true;
}
