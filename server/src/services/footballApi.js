import { db, getSetting } from "../db.js";

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
function applyKnockouts(fixtures) {
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
       kickoff=COALESCE(?, kickoff), provider_fixture_id=?, updated_at=?
     WHERE id=?`
  );
  const updateFinal = db.prepare(
    `UPDATE matches SET home_team=?, away_team=?, official_home=?, official_away=?,
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
        const kickoff = f.utcDate ? f.utcDate.replace(/Z$/, "") : null;
        if (status === "FINISHED" && f.homeScore != null && f.awayScore != null) {
          updateFinal.run(
            home, away, f.homeScore, f.awayScore, status,
            kickoff, f.id, now, o.id
          );
          scoresUpdated += 1;
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

// Pull latest results from the configured provider and update matches.
// Returns a summary; safely no-ops when no API key is configured.
export async function refreshResults() {
  const apiKey = getSetting("football_api_key", process.env.FOOTBALL_API_KEY);
  if (!apiKey) return { skipped: "no FOOTBALL_API_KEY" };
  const providerName = getSetting(
    "football_provider",
    process.env.FOOTBALL_PROVIDER || "football-data"
  );
  const provider = PROVIDERS[providerName];
  if (!provider) return { error: `unknown provider ${providerName}` };

  let fixtures;
  try {
    fixtures = await provider(apiKey);
  } catch (e) {
    return { error: e.message };
  }

  const select = db.prepare(
    "SELECT id, home_team, away_team FROM matches WHERE home_team=? AND away_team=?"
  );
  // Only write scores when the match is FINISHED. For LIVE/SCHEDULED we still
  // track the status so the UI can show "en vivo", but leave official_home/away
  // alone to avoid showing partial scores mid-match.
  const updateFinal = db.prepare(
    `UPDATE matches SET official_home=?, official_away=?, status=?,
       provider_fixture_id=?, updated_at=? WHERE id=?`
  );
  const updateStatus = db.prepare(
    `UPDATE matches SET status=?, provider_fixture_id=?, updated_at=? WHERE id=?`
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
      if (status === "FINISHED") {
        const swapped = row.home_team !== home;
        const oh = swapped ? f.awayScore : f.homeScore;
        const oa = swapped ? f.homeScore : f.awayScore;
        updateFinal.run(oh, oa, status, f.id, now, row.id);
        updated += 1;
      } else {
        updateStatus.run(status, f.id, now, row.id);
      }
    }
  });
  tx(fixtures);
  const ko = applyKnockouts(fixtures);
  return {
    provider: providerName,
    fixtures: fixtures.length,
    matched,
    updated,
    ko,
  };
}
