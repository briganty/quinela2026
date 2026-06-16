// Scoring rules for the quiniela:
//   - exact score  -> 3 points
//   - correct outcome only (winner or draw) -> 1 point
//   - otherwise -> 0 points
// All scores are in the orientation of the prediction (home, away).

export const OUTCOME = (h, a) => (h > a ? "H" : h < a ? "A" : "D");

export function points(officialHome, officialAway, predHome, predAway) {
  if (
    officialHome == null ||
    officialAway == null ||
    predHome == null ||
    predAway == null
  ) {
    return 0;
  }
  if (officialHome === predHome && officialAway === predAway) return 3;
  if (OUTCOME(officialHome, officialAway) === OUTCOME(predHome, predAway)) return 1;
  return 0;
}

// Resolve the official result for a pool match, honoring orientation.
// `match` is the canonical match row (may be null); `reversed` flips home/away.
export function officialFor(match, reversed) {
  if (!match || match.official_home == null || match.official_away == null) {
    return { home: null, away: null };
  }
  return reversed
    ? { home: match.official_away, away: match.official_home }
    : { home: match.official_home, away: match.official_away };
}
