// One-shot: add knockout-stage placeholder matches to seed.json and stdout JSON.
// Teams are placeholders (e.g. "1° A", "Ganador 73") until they qualify.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(__dirname, "..", "server", "data", "seed.json");

// ISO helper (date only — time set in early evening as a placeholder)
const iso = (dmy, hhmm = "19:00") => {
  const [d, m, y] = dmy.split("/").map((x) => x.padStart(2, "0").padStart(2, "0"));
  return `${y}-${m}-${d}T${hhmm}:00`;
};

// --- Round of 32 (from "Segunda Fase" tab of the Excel) ---
const R32 = [
  { match_no: 73, kickoff: iso("28/06/2026"), stadium: "Los Ángeles",          home: "2° A", away: "2° B" },
  { match_no: 74, kickoff: iso("29/06/2026"), stadium: "Boston",               home: "1° E", away: "Mejor 3°" },
  { match_no: 75, kickoff: iso("29/06/2026"), stadium: "Monterrey",            home: "1° F", away: "2° C" },
  { match_no: 76, kickoff: iso("29/06/2026"), stadium: "Houston",              home: "1° C", away: "2° F" },
  { match_no: 77, kickoff: iso("30/06/2026"), stadium: "Nueva York/NJ",        home: "1° I", away: "Mejor 3°" },
  { match_no: 78, kickoff: iso("30/06/2026"), stadium: "Dallas",               home: "2° E", away: "2° I" },
  { match_no: 79, kickoff: iso("30/06/2026"), stadium: "Ciudad de México",     home: "1° A", away: "Mejor 3°" },
  { match_no: 80, kickoff: iso("01/07/2026"), stadium: "Atlanta",              home: "1° L", away: "Mejor 3°" },
  { match_no: 81, kickoff: iso("01/07/2026"), stadium: "San Francisco Bay",    home: "1° D", away: "Mejor 3°" },
  { match_no: 82, kickoff: iso("01/07/2026"), stadium: "Seattle",              home: "1° G", away: "Mejor 3°" },
  { match_no: 83, kickoff: iso("02/07/2026"), stadium: "Toronto",              home: "2° K", away: "2° L" },
  { match_no: 84, kickoff: iso("02/07/2026"), stadium: "Los Ángeles",          home: "1° H", away: "2° J" },
  { match_no: 85, kickoff: iso("02/07/2026"), stadium: "Vancouver",            home: "1° B", away: "Mejor 3°" },
  { match_no: 86, kickoff: iso("03/07/2026"), stadium: "Miami",                home: "1° J", away: "2° H" },
  { match_no: 87, kickoff: iso("03/07/2026"), stadium: "Kansas City",          home: "1° K", away: "Mejor 3°" },
  { match_no: 88, kickoff: iso("03/07/2026"), stadium: "Dallas",               home: "2° D", away: "2° G" },
].map((m) => ({ ...m, phase: "R32", group_code: null }));

// --- Round of 16, QF, SF, 3rd, Final — sequential bracket placeholders ---
const winnerOf = (n) => `Ganador ${n}`;
const loserOf = (n) => `Perdedor ${n}`;

const R16 = [
  { match_no: 89,  kickoff: iso("04/07/2026"), stadium: "Filadelfia",     home: winnerOf(73), away: winnerOf(74) },
  { match_no: 90,  kickoff: iso("04/07/2026"), stadium: "Boston",         home: winnerOf(75), away: winnerOf(76) },
  { match_no: 91,  kickoff: iso("05/07/2026"), stadium: "Dallas",         home: winnerOf(77), away: winnerOf(78) },
  { match_no: 92,  kickoff: iso("05/07/2026"), stadium: "Atlanta",        home: winnerOf(79), away: winnerOf(80) },
  { match_no: 93,  kickoff: iso("06/07/2026"), stadium: "Los Ángeles",    home: winnerOf(81), away: winnerOf(82) },
  { match_no: 94,  kickoff: iso("06/07/2026"), stadium: "Miami",          home: winnerOf(83), away: winnerOf(84) },
  { match_no: 95,  kickoff: iso("07/07/2026"), stadium: "Nueva York/NJ",  home: winnerOf(85), away: winnerOf(86) },
  { match_no: 96,  kickoff: iso("07/07/2026"), stadium: "Vancouver",      home: winnerOf(87), away: winnerOf(88) },
].map((m) => ({ ...m, phase: "R16", group_code: null }));

const QF = [
  { match_no: 97,  kickoff: iso("09/07/2026"), stadium: "Boston",       home: winnerOf(89), away: winnerOf(90) },
  { match_no: 98,  kickoff: iso("09/07/2026"), stadium: "Los Ángeles",  home: winnerOf(93), away: winnerOf(94) },
  { match_no: 99,  kickoff: iso("10/07/2026"), stadium: "Miami",        home: winnerOf(91), away: winnerOf(92) },
  { match_no: 100, kickoff: iso("10/07/2026"), stadium: "Kansas City",  home: winnerOf(95), away: winnerOf(96) },
].map((m) => ({ ...m, phase: "QF", group_code: null }));

const SF = [
  { match_no: 101, kickoff: iso("14/07/2026"), stadium: "Dallas",         home: winnerOf(97),  away: winnerOf(98) },
  { match_no: 102, kickoff: iso("15/07/2026"), stadium: "Atlanta",        home: winnerOf(99),  away: winnerOf(100) },
].map((m) => ({ ...m, phase: "SF", group_code: null }));

const THIRD = [
  { match_no: 103, kickoff: iso("18/07/2026"), stadium: "Miami",          home: loserOf(101), away: loserOf(102), phase: "3RD", group_code: null },
];

const FINAL = [
  { match_no: 104, kickoff: iso("19/07/2026", "16:00"), stadium: "Nueva York/NJ", home: winnerOf(101), away: winnerOf(102), phase: "FINAL", group_code: null },
];

const knockout = [...R32, ...R16, ...QF, ...SF, ...THIRD, ...FINAL].map((m) => ({
  match_no: m.match_no,
  kickoff: m.kickoff,
  stadium: m.stadium,
  group_code: m.group_code,
  phase: m.phase,
  home_team: m.home,
  away_team: m.away,
  official_home: null,
  official_away: null,
  status: "SCHEDULED",
}));

// Update seed.json — replace any existing match_no >= 73 with this canonical list.
const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
seed.matches = seed.matches.filter((m) => m.match_no < 73).concat(knockout);
writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2));

// Also dump just the new matches as JSON so the container injector can read it.
process.stdout.write(JSON.stringify(knockout));
console.error(`seed.json updated. knockout matches: ${knockout.length}`);
