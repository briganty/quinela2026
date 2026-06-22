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

// Live notifications feed: which match is on now (with its goals so far) and
// which one is up next. Goals only surface for matches still in progress.
export function liveFeed() {
  const live = db
    .prepare(
      `SELECT id, home_team, away_team, live_home, live_away, live_minute,
              kickoff, group_code, phase, updated_at
       FROM matches WHERE status = 'LIVE' ORDER BY kickoff, id`
    )
    .all();
  // Kickoffs are stored in Costa Rica local time (UTC-6, no DST). Compare
  // against "now" in that same zone so a match already under way isn't shown
  // as next; fall back to the earliest scheduled if all remaining have passed.
  const tzOffsetMin = Number(process.env.TZ_OFFSET_MINUTES ?? -360);
  const nowLocal = new Date(Date.now() + tzOffsetMin * 60 * 1000)
    .toISOString()
    .slice(0, 19);
  const nextSql = (where) =>
    `SELECT id, home_team, away_team, kickoff, group_code, phase
     FROM matches WHERE status = 'SCHEDULED'${where} ORDER BY kickoff, id LIMIT 1`;
  const next =
    db.prepare(nextSql(" AND kickoff >= ?")).get(nowLocal) ||
    db.prepare(nextSql("")).get();
  const events = db
    .prepare(
      `SELECT e.match_id, e.type, e.team, e.player, e.minute
       FROM match_events e JOIN matches m ON m.id = e.match_id
       WHERE m.status = 'LIVE'
       ORDER BY e.match_id, e.minute, e.id`
    )
    .all();
  return { live, next: next || null, events };
}

// Group-stage standings for every World Cup group, built from official results.
// Tiebreakers: points, then goal difference, then goals for, then name
// (a simplified subset of FIFA's full criteria — no head-to-head/fair-play).
export function groupStandings() {
  const teams = db
    .prepare("SELECT name, group_code FROM teams ORDER BY group_code, name")
    .all();
  const matches = db
    .prepare(
      `SELECT home_team, away_team, official_home, official_away
       FROM matches WHERE phase = 'GROUP'`
    )
    .all();

  const stat = new Map();
  for (const t of teams) {
    stat.set(t.name, {
      team: t.name,
      group: t.group_code,
      played: 0, won: 0, drawn: 0, lost: 0,
      gf: 0, ga: 0, gd: 0, points: 0,
    });
  }
  for (const m of matches) {
    if (m.official_home == null || m.official_away == null) continue; // played only
    const h = stat.get(m.home_team);
    const a = stat.get(m.away_team);
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += m.official_home; h.ga += m.official_away;
    a.gf += m.official_away; a.ga += m.official_home;
    if (m.official_home > m.official_away) {
      h.won++; h.points += 3; a.lost++;
    } else if (m.official_home < m.official_away) {
      a.won++; a.points += 3; h.lost++;
    } else {
      h.drawn++; a.drawn++; h.points++; a.points++;
    }
  }
  for (const s of stat.values()) s.gd = s.gf - s.ga;

  const groups = new Map();
  for (const s of stat.values()) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }
  return [...groups.keys()]
    .sort()
    .map((code) => ({
      code,
      teams: groups.get(code).sort(
        (x, y) =>
          y.points - x.points ||
          y.gd - x.gd ||
          y.gf - x.gf ||
          x.team.localeCompare(y.team)
      ),
    }));
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
              m.official_home, m.official_away, m.live_home, m.live_away
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
      {
        player_id: p.id,
        name: p.name,
        points: 0,
        exact: 0,
        outcome: 0,
        played: 0,
        livePoints: 0, // provisional points from matches in progress
        liveMatches: 0,
      },
    ])
  );
  const liveMatches = []; // in-progress matches, with each player's prediction
  for (const pm of pms) {
    const finalOff = officialFor(
      { official_home: pm.official_home, official_away: pm.official_away },
      pm.reversed
    );
    const liveOff = officialFor(
      { official_home: pm.live_home, official_away: pm.live_away },
      pm.reversed
    );
    const isLive =
      pm.status === "LIVE" && finalOff.home == null && liveOff.home != null;
    const score = finalOff.home != null ? finalOff : isLive ? liveOff : null;
    if (score == null) continue;
    const predMap = predsByPm.get(pm.id) || new Map();

    if (isLive) {
      // Live match: tally provisional points and expose every player's pick so
      // the standings table can show a per-player prediction column.
      const lm = {
        pool_match_id: pm.id,
        home_team: pm.home_team,
        away_team: pm.away_team,
        score: { home: score.home, away: score.away },
        preds: {},
      };
      for (const pl of players) {
        const pr = predMap.get(pl.id);
        const has = pr && (pr.pred_home != null || pr.pred_away != null);
        lm.preds[pl.id] = has
          ? `${pr.pred_home ?? "-"}-${pr.pred_away ?? "-"}`
          : null;
        if (has) {
          const row = table.get(pl.id);
          row.livePoints += points(score.home, score.away, pr.pred_home, pr.pred_away);
          row.liveMatches += 1;
        }
      }
      liveMatches.push(lm);
    } else {
      // Finished match: counts toward the official totals.
      for (const [playerId, pr] of predMap) {
        const row = table.get(playerId);
        if (!row) continue;
        const pts = points(score.home, score.away, pr.pred_home, pr.pred_away);
        row.points += pts;
        row.played += 1;
        if (pts === 3) row.exact += 1;
        else if (pts === 1) row.outcome += 1;
      }
    }
  }
  const rows = [...table.values()].sort(
    (a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name)
  );
  return { rows, liveMatches };
}

// Grid: matches (rows) x players (columns) with each prediction and its points.
export function grid(poolId) {
  const players = poolPlayers(poolId);
  const { pms, predsByPm } = poolRows(poolId);
  const rows = pms.map((pm) => {
    const finalOff = officialFor(
      { official_home: pm.official_home, official_away: pm.official_away },
      pm.reversed
    );
    const liveOff = officialFor(
      { official_home: pm.live_home, official_away: pm.live_away },
      pm.reversed
    );
    // Provisional: match is in progress and no final score is in yet. The grid
    // scores predictions against the live score, flagged so the UI can color
    // those points differently.
    const isLive =
      pm.status === "LIVE" && finalOff.home == null && liveOff.home != null;
    const score = finalOff.home != null ? finalOff : isLive ? liveOff : null;
    const predMap = predsByPm.get(pm.id) || new Map();
    const cells = players.map((pl) => {
      const pr = predMap.get(pl.id);
      if (!pr || (pr.pred_home == null && pr.pred_away == null)) {
        return { player_id: pl.id, pred: null, points: null, live: false };
      }
      const pts =
        score == null
          ? null
          : points(score.home, score.away, pr.pred_home, pr.pred_away);
      return {
        player_id: pl.id,
        pred: `${pr.pred_home ?? "-"}-${pr.pred_away ?? "-"}`,
        points: pts,
        live: score != null && isLive,
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
        finalOff.home == null ? null : { home: finalOff.home, away: finalOff.away },
      live: isLive ? { home: liveOff.home, away: liveOff.away } : null,
      cells,
    };
  });
  return { players, rows };
}
