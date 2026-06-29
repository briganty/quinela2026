import { db, getSetting } from "../db.js";

// Providers give kickoff times in UTC; we store them in Costa Rica local time
// (UTC-6, no DST) to match the seed convention. Returns a naive ISO string.
const CR_OFFSET_MIN = Number(process.env.TZ_OFFSET_MINUTES ?? -360);
function toCrKickoff(utc) {
  if (!utc) return null;
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + CR_OFFSET_MIN * 60000).toISOString().slice(0, 19);
}

// Map our Spanish team names to normalized aliases used by football data
// providers (football-data.org / API-Football use English names).
const EN = {
  "México": "Mexico",
  "Sudáfrica": "South Africa",
  "Corea del Sur": "Korea Republic|South Korea",
  "Chequia": "Czechia|Czech Republic",
  "Canadá": "Canada",
  "Bosnia y Herzegovina": "Bosnia and Herzegovina|Bosnia-Herzegovina",
  "Qatar": "Qatar",
  "Suiza": "Switzerland",
  "Brasil": "Brazil",
  "Marruecos": "Morocco",
  "Haití": "Haiti",
  "Escocia": "Scotland",
  "Estados Unidos": "United States|USA",
  "Paraguay": "Paraguay",
  "Australia": "Australia",
  "Turquía": "Turkey|Turkiye|Türkiye",
  "Alemania": "Germany",
  "Curazao": "Curacao|Curaçao",
  "Costa de Marfil": "Ivory Coast|Cote d'Ivoire|Côte d'Ivoire",
  "Ecuador": "Ecuador",
  "Países Bajos": "Netherlands",
  "Japón": "Japan",
  "Suecia": "Sweden",
  "Túnez": "Tunisia",
  "Bélgica": "Belgium",
  "Egipto": "Egypt",
  "Irán": "Iran|IR Iran",
  "Nueva Zelanda": "New Zealand",
  "España": "Spain",
  "Cabo Verde": "Cape Verde|Cabo Verde",
  "Arabia Saudita": "Saudi Arabia",
  "Uruguay": "Uruguay",
  "Francia": "France",
  "Senegal": "Senegal",
  "Irak": "Iraq",
  "Noruega": "Norway",
  "Argentina": "Argentina",
  "Argelia": "Algeria",
  "Austria": "Austria",
  "Jordania": "Jordan",
  "Portugal": "Portugal",
  "RD Congo": "DR Congo|Congo DR|Democratic Republic of the Congo",
  "Uzbekistán": "Uzbekistan",
  "Colombia": "Colombia",
  "Inglaterra": "England",
  "Croacia": "Croatia",
  "Ghana": "Ghana",
  "Panamá": "Panama",
};

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/gi, "")
    .trim()
    .toLowerCase();

// Build a lookup from any provider alias -> our Spanish team name.
const aliasToEs = new Map();
for (const [es, aliases] of Object.entries(EN)) {
  aliasToEs.set(norm(es), es);
  for (const a of aliases.split("|")) aliasToEs.set(norm(a), es);
}

function resolveTeam(providerName) {
  const n = norm(providerName);
  if (aliasToEs.has(n)) return aliasToEs.get(n);
  // tolerant fallback: provider name contains an alias or vice versa
  for (const [alias, es] of aliasToEs) {
    if (alias && (n.includes(alias) || alias.includes(n))) return es;
  }
  return null;
}

// --- provider: football-data.org ----------------------------------------
async function fetchFootballDataOrg(apiKey) {
  const comp = process.env.FOOTBALL_COMPETITION || "WC";
  const url = `https://api.football-data.org/v4/competitions/${comp}/matches`;
  const res = await fetch(url, { headers: { "X-Auth-Token": apiKey } });
  if (!res.ok) throw new Error(`football-data.org ${res.status}`);
  const data = await res.json();
  return (data.matches || []).map((m) => ({
    id: String(m.id),
    home: m.homeTeam?.name || m.homeTeam?.shortName || null,
    away: m.awayTeam?.name || m.awayTeam?.shortName || null,
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    rawStatus: m.status, // SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED, ...
    rawStage: m.stage,   // GROUP_STAGE, LAST_32, LAST_16, QUARTER_FINALS, ...
    utcDate: m.utcDate,
  }));
}

// --- provider: API-Sports (api-football.com) ----------------------------
// League 1 = FIFA World Cup. Season is the tournament year (e.g. 2026).
async function fetchApiSports(apiKey) {
  const league = process.env.FOOTBALL_API_LEAGUE || "1";
  const season = process.env.FOOTBALL_API_SEASON || "2026";
  const url = `https://v3.football.api-sports.io/fixtures?league=${league}&season=${season}`;
  const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });
  if (!res.ok) throw new Error(`api-sports ${res.status}`);
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length) {
    const msg = Object.values(data.errors).join("; ");
    throw new Error(`api-sports: ${msg}`);
  }
  return (data.response || []).map((m) => ({
    id: String(m.fixture.id),
    home: m.teams?.home?.name || null,
    away: m.teams?.away?.name || null,
    homeScore: m.goals?.home ?? null,
    awayScore: m.goals?.away ?? null,
    rawStatus: m.fixture?.status?.short, // NS, 1H, HT, 2H, ET, P, FT, AET, PEN, ...
    rawStage: null, // api-sports uses league.round string; not wired yet
    utcDate: m.fixture?.date,
  }));
}

// --- companion source: ESPN (keyless) -----------------------------------
// football-data.org gives the scores; ESPN supplies the live match minute and
// the goal/card events. One keyless scoreboard call covers every fixture.
const ESPN_LEAGUE = process.env.FOOTBALL_ESPN_LEAGUE || "fifa.world";
const ESPN_BASE = `https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_LEAGUE}`;

// Classify an ESPN key-event text into the kinds we surface, or null to skip.
function espnEventKind(text = "") {
  if (/red card|second yellow/i.test(text)) return "RED";
  if (/yellow card/i.test(text)) return "YELLOW";
  if (/goal/i.test(text) && !/no goal|disallow|missed penalty|penalty missed/i.test(text))
    return "GOAL";
  return null;
}

// Live minute + goal/card events from a single scoreboard call, keyed by our
// Spanish "home|away" team pair so it can be matched to football-data rows.
async function fetchEspnLive() {
  const res = await fetch(`${ESPN_BASE}/scoreboard`);
  if (!res.ok) throw new Error(`espn ${res.status}`);
  const data = await res.json();
  const byPair = new Map();
  for (const ev of data.events || []) {
    const comp = ev.competitions?.[0] || {};
    const cs = comp.competitors || [];
    const homeRaw = cs.find((c) => c.homeAway === "home")?.team;
    const awayRaw = cs.find((c) => c.homeAway === "away")?.team;
    const homeEs = resolveTeam(homeRaw?.displayName || homeRaw?.name);
    const awayEs = resolveTeam(awayRaw?.displayName || awayRaw?.name);
    if (!homeEs || !awayEs) continue;
    const teamById = new Map(
      cs.map((c) => [
        String(c.team?.id),
        resolveTeam(c.team?.displayName || c.team?.name) ||
          c.team?.displayName ||
          c.team?.name ||
          null,
      ])
    );
    // displayClock looks like "57'" or "90'+2'"; parseInt stops at the quote,
    // giving the base minute (90 during stoppage, which we display as "90+").
    const clock = ev.status?.displayClock || comp.status?.displayClock || "";
    const minute = parseInt(String(clock), 10);
    const events = [];
    for (const d of comp.details || []) {
      const kind = espnEventKind(d.type?.text || "");
      if (!kind) continue;
      const player = (d.athletesInvolved || [])[0]?.displayName || null;
      const evClock = d.clock?.displayValue || "";
      const evMin = parseInt(String(evClock), 10);
      events.push({
        type: kind,
        providerEventId: [kind, evClock, player || "", d.type?.text || ""].join("-"),
        team: teamById.get(String(d.team?.id)) || null,
        player,
        minute: Number.isNaN(evMin) ? null : evMin,
      });
    }
    byPair.set(`${homeEs}|${awayEs}`, {
      minute: Number.isNaN(minute) ? null : minute,
      state: ev.status?.type?.state, // pre | in | post
      events,
    });
  }
  return byPair;
}

function mapStatus(raw) {
  // football-data.org statuses
  if (raw === "FINISHED") return "FINISHED";
  if (raw === "IN_PLAY" || raw === "PAUSED" || raw === "LIVE") return "LIVE";
  // api-sports short codes
  if (raw === "FT" || raw === "AET" || raw === "PEN") return "FINISHED";
  if (raw === "1H" || raw === "HT" || raw === "2H" || raw === "ET" || raw === "P" || raw === "LIVE") return "LIVE";
  return "SCHEDULED";
}

const PROVIDERS = {
  "football-data": fetchFootballDataOrg,
  "api-sports": fetchApiSports,
};

const STAGE_TO_PHASE = {
  LAST_32: "R32",
  LAST_16: "R16",
  QUARTER_FINALS: "QF",
  SEMI_FINALS: "SF",
  THIRD_PLACE: "3RD",
  FINAL: "FINAL",
};
const KO_PHASES = Object.values(STAGE_TO_PHASE);

// Match knockout fixtures to our placeholder rows by (phase, chronological order).
// The API reveals team names as teams qualify — we overwrite our placeholders,
// and once status=FINISHED the scores are written too. Returns counts.
function applyKnockouts(fixtures, espnMinute = () => null) {
  const apiByPhase = {};
  for (const f of fixtures) {
    const phase = STAGE_TO_PHASE[f.rawStage];
    if (!phase) continue;
    (apiByPhase[phase] ||= []).push(f);
  }
  for (const list of Object.values(apiByPhase)) {
    list.sort((a, b) => (a.utcDate || "").localeCompare(b.utcDate || ""));
  }

  const ours = db
    .prepare(
      `SELECT id, phase, home_team, away_team, kickoff
       FROM matches WHERE phase IN ('R32','R16','QF','SF','3RD','FINAL')
       ORDER BY phase, kickoff, id`
    )
    .all();
  const ourByPhase = {};
  for (const m of ours) (ourByPhase[m.phase] ||= []).push(m);

  const updateMeta = db.prepare(
    `UPDATE matches SET home_team=?, away_team=?, status=?,
       live_home=NULL, live_away=NULL, live_minute=NULL,
       kickoff=COALESCE(?, kickoff), provider_fixture_id=?, updated_at=?
     WHERE id=?`
  );
  const updateLive = db.prepare(
    `UPDATE matches SET home_team=?, away_team=?, live_home=?, live_away=?,
       live_minute=?, status=?, kickoff=COALESCE(?, kickoff),
       provider_fixture_id=?, updated_at=?
     WHERE id=?`
  );
  const updateFinal = db.prepare(
    `UPDATE matches SET home_team=?, away_team=?, official_home=?, official_away=?,
       live_home=NULL, live_away=NULL, live_minute=NULL,
       status=?, kickoff=COALESCE(?, kickoff), provider_fixture_id=?, updated_at=?
     WHERE id=?`
  );

  let matched = 0;
  let namesUpdated = 0;
  let scoresUpdated = 0;
  const tx = db.transaction(() => {
    for (const phase of KO_PHASES) {
      const ourList = ourByPhase[phase] || [];
      const apiList = apiByPhase[phase] || [];
      const n = Math.min(ourList.length, apiList.length);
      for (let i = 0; i < n; i++) {
        const o = ourList[i];
        const f = apiList[i];
        matched += 1;
        const home = f.home || o.home_team;
        const away = f.away || o.away_team;
        const namesChanged = home !== o.home_team || away !== o.away_team;
        const status = mapStatus(f.rawStatus);
        const now = new Date().toISOString();
        const kickoff = toCrKickoff(f.utcDate);
        if (status === "FINISHED" && f.homeScore != null && f.awayScore != null) {
          updateFinal.run(
            home, away, f.homeScore, f.awayScore, status,
            kickoff, f.id, now, o.id
          );
          scoresUpdated += 1;
          if (namesChanged) namesUpdated += 1;
        } else if (status === "LIVE" && f.homeScore != null && f.awayScore != null) {
          const minute = espnMinute(resolveTeam(home) || home, resolveTeam(away) || away);
          updateLive.run(
            home, away, f.homeScore, f.awayScore, minute, status,
            kickoff, f.id, now, o.id
          );
          if (namesChanged) namesUpdated += 1;
        } else {
          updateMeta.run(home, away, status, kickoff, f.id, now, o.id);
          if (namesChanged) namesUpdated += 1;
        }
      }
    }
  });
  tx();
  return { matched, namesUpdated, scoresUpdated };
}

// Keep the live event feed in sync from ESPN: insert goals + cards for matches
// that are LIVE and clear a match's events once it is no longer live (so the
// notifications go away at FT). Matched to our rows by Spanish team pair.
function syncEventsFromEspn(espn) {
  db.prepare(
    "DELETE FROM match_events WHERE match_id IN (SELECT id FROM matches WHERE status != 'LIVE')"
  ).run();

  const liveMatches = db
    .prepare("SELECT id, home_team, away_team FROM matches WHERE status = 'LIVE'")
    .all();
  if (!liveMatches.length) return { liveTracked: 0, eventsAdded: 0 };

  const ins = db.prepare(
    `INSERT OR IGNORE INTO match_events
       (match_id, type, provider_event_id, team, player, minute, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  let eventsAdded = 0;
  for (const m of liveMatches) {
    const entry =
      espn.get(`${m.home_team}|${m.away_team}`) ||
      espn.get(`${m.away_team}|${m.home_team}`);
    if (!entry) continue;
    const now = new Date().toISOString();
    for (const e of entry.events) {
      const team = resolveTeam(e.team) || e.team;
      const info = ins.run(
        m.id, e.type, e.providerEventId, team, e.player, e.minute, now
      );
      if (info.changes) eventsAdded += 1;
    }
  }
  return { liveTracked: liveMatches.length, eventsAdded };
}

// Pull latest results and update matches. Scores come from the configured
// provider (football-data.org by default); the live minute and goal/card
// events come from ESPN. Both are fetched in parallel. Safely no-ops with no key.
export async function refreshResults() {
  let providerName = getSetting(
    "football_provider",
    process.env.FOOTBALL_PROVIDER || "football-data"
  );
  if (!PROVIDERS[providerName]) providerName = "football-data";
  const apiKey = getSetting("football_api_key", process.env.FOOTBALL_API_KEY);
  if (!apiKey) return { skipped: "no FOOTBALL_API_KEY" };
  const provider = PROVIDERS[providerName];

  // Two simultaneous requests: scores from the provider, minute + events from
  // ESPN. ESPN failing must not block the scores update.
  const [scoresR, espnR] = await Promise.allSettled([
    provider(apiKey),
    fetchEspnLive(),
  ]);
  if (scoresR.status !== "fulfilled")
    return { error: scoresR.reason?.message || "scores fetch failed" };
  const fixtures = scoresR.value;
  const espn = espnR.status === "fulfilled" ? espnR.value : new Map();
  const espnError = espnR.status === "rejected"
    ? espnR.reason?.message || "espn failed"
    : null;
  // Live minute for a match (resolved Spanish names), either orientation.
  const espnMinute = (home, away) =>
    (espn.get(`${home}|${away}`) || espn.get(`${away}|${home}`))?.minute ?? null;

  const select = db.prepare(
    "SELECT id, home_team, away_team FROM matches WHERE home_team=? AND away_team=?"
  );
  // Official scores are written only when the match is FINISHED, so the
  // standings reflect final results. For a LIVE match we record the current
  // score in live_home/live_away (kept separate from official) so the grid can
  // show provisional points without polluting the official table.
  const updateFinal = db.prepare(
    `UPDATE matches SET official_home=?, official_away=?,
       live_home=NULL, live_away=NULL, live_minute=NULL, status=?,
       provider_fixture_id=?, updated_at=? WHERE id=?`
  );
  const updateLive = db.prepare(
    `UPDATE matches SET live_home=?, live_away=?, live_minute=?, status=?,
       provider_fixture_id=?, updated_at=? WHERE id=?`
  );
  const updateStatus = db.prepare(
    `UPDATE matches SET status=?, live_home=NULL, live_away=NULL,
       live_minute=NULL, provider_fixture_id=?, updated_at=? WHERE id=?`
  );
  let updated = 0;
  let matched = 0;
  const tx = db.transaction((items) => {
    for (const f of items) {
      const home = resolveTeam(f.home);
      const away = resolveTeam(f.away);
      if (!home || !away) continue;
      let row = select.get(home, away);
      if (!row) row = select.get(away, home); // try swapped orientation
      if (!row) continue;
      matched += 1;
      const status = mapStatus(f.rawStatus);
      const now = new Date().toISOString();
      const swapped = row.home_team !== home;
      const sh = swapped ? f.awayScore : f.homeScore;
      const sa = swapped ? f.homeScore : f.awayScore;
      if (status === "FINISHED") {
        updateFinal.run(sh, sa, status, f.id, now, row.id);
        updated += 1;
      } else if (status === "LIVE" && sh != null && sa != null) {
        updateLive.run(sh, sa, espnMinute(home, away), status, f.id, now, row.id);
      } else {
        updateStatus.run(status, f.id, now, row.id);
      }
    }
  });
  tx(fixtures);
  const ko = applyKnockouts(fixtures, espnMinute);
  const events = syncEventsFromEspn(espn);
  return {
    scoresFrom: providerName,
    eventsFrom: "espn",
    fixtures: fixtures.length,
    matched,
    updated,
    ko,
    events,
    espnError,
  };
}
