import { db } from "../db.js";

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
    home: m.homeTeam?.name || m.homeTeam?.shortName,
    away: m.awayTeam?.name || m.awayTeam?.shortName,
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    rawStatus: m.status, // SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED, ...
  }));
}

function mapStatus(raw) {
  if (raw === "FINISHED") return "FINISHED";
  if (raw === "IN_PLAY" || raw === "PAUSED" || raw === "LIVE") return "LIVE";
  return "SCHEDULED";
}

const PROVIDERS = { "football-data": fetchFootballDataOrg };

// Pull latest results from the configured provider and update matches.
// Returns a summary; safely no-ops when no API key is configured.
export async function refreshResults() {
  const apiKey = process.env.FOOTBALL_API_KEY;
  if (!apiKey) return { skipped: "no FOOTBALL_API_KEY" };
  const providerName = process.env.FOOTBALL_PROVIDER || "football-data";
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
  const update = db.prepare(
    `UPDATE matches SET official_home=?, official_away=?, status=?,
       provider_fixture_id=?, updated_at=? WHERE id=?`
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
      const swapped = row.home_team !== home;
      const oh = swapped ? f.awayScore : f.homeScore;
      const oa = swapped ? f.homeScore : f.awayScore;
      const status = mapStatus(f.rawStatus);
      update.run(
        oh,
        oa,
        status,
        f.id,
        new Date().toISOString(),
        row.id
      );
      updated += 1;
    }
  });
  tx(fixtures);
  return { provider: providerName, fixtures: fixtures.length, matched, updated };
}
