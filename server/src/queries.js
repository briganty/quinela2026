import { db } from "./db.js";
import { points, officialFor } from "./scoring.js";

export function listPools() {
  return db.prepare("SELECT id, name FROM pools ORDER BY id").all();
}

export function listMatches() {
  return db
    .prepare(
      `SELECT id, match_no, kickoff, stadium, group_code, phase,
              home_team, away_team, official_home, official_away, status, updated_at
       FROM matches ORDER BY match_no`
    )
    .all();
}

function poolPlayers(poolId) {
  return db
    .prepare(
      "SELECT id, name FROM players WHERE pool_id = ? ORDER BY display_order, id"
    )
    .all(poolId);
}

// Returns rows joining pool_matches with their canonical match + per-player preds.
function poolRows(poolId) {
  const pms = db
    .prepare(
      `SELECT pm.id, pm.position, pm.home_team, pm.away_team, pm.reversed,
              m.id AS match_id, m.kickoff, m.status,
              m.official_home, m.official_away
       FROM pool_matches pm
       LEFT JOIN matches m ON m.id = pm.match_id
       WHERE pm.pool_id = ?
       ORDER BY pm.position`
    )
    .all(poolId);
  const preds = db
    .prepare(
      `SELECT pool_match_id, player_id, pred_home, pred_away
       FROM predictions p
       JOIN pool_matches pm ON pm.id = p.pool_match_id
       WHERE pm.pool_id = ?`
    )
    .all(poolId);
  const byPm = new Map();
  for (const p of preds) {
    if (!byPm.has(p.pool_match_id)) byPm.set(p.pool_match_id, new Map());
    byPm.get(p.pool_match_id).set(p.player_id, p);
  }
  return { pms, predsByPm: byPm };
}

// Standings: total points + exact/outcome counts per player.
export function standings(poolId) {
  const players = poolPlayers(poolId);
  const { pms, predsByPm } = poolRows(poolId);
  const table = new Map(
    players.map((p) => [
      p.id,
      { player_id: p.id, name: p.name, points: 0, exact: 0, outcome: 0, played: 0 },
    ])
  );
  for (const pm of pms) {
    const off = officialFor(
      { official_home: pm.official_home, official_away: pm.official_away },
      pm.reversed
    );
    if (off.home == null) continue;
    const predMap = predsByPm.get(pm.id);
    if (!predMap) continue;
    for (const [playerId, pr] of predMap) {
      const row = table.get(playerId);
      if (!row) continue;
      const pts = points(off.home, off.away, pr.pred_home, pr.pred_away);
      row.points += pts;
      row.played += 1;
      if (pts === 3) row.exact += 1;
      else if (pts === 1) row.outcome += 1;
    }
  }
  return [...table.values()].sort(
    (a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name)
  );
}

// Grid: matches (rows) x players (columns) with each prediction and its points.
export function grid(poolId) {
  const players = poolPlayers(poolId);
  const { pms, predsByPm } = poolRows(poolId);
  const rows = pms.map((pm) => {
    const off = officialFor(
      { official_home: pm.official_home, official_away: pm.official_away },
      pm.reversed
    );
    const predMap = predsByPm.get(pm.id) || new Map();
    const cells = players.map((pl) => {
      const pr = predMap.get(pl.id);
      if (!pr || (pr.pred_home == null && pr.pred_away == null)) {
        return { player_id: pl.id, pred: null, points: null };
      }
      const pts =
        off.home == null
          ? null
          : points(off.home, off.away, pr.pred_home, pr.pred_away);
      return {
        player_id: pl.id,
        pred: `${pr.pred_home ?? "-"}-${pr.pred_away ?? "-"}`,
        points: pts,
      };
    });
    return {
      pool_match_id: pm.id,
      position: pm.position,
      kickoff: pm.kickoff,
      status: pm.status || "SCHEDULED",
      home_team: pm.home_team,
      away_team: pm.away_team,
      official:
        off.home == null ? null : { home: off.home, away: off.away },
      cells,
    };
  });
  return { players, rows };
}
