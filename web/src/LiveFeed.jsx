import { useEffect, useState } from "react";
import { getFeed } from "./api.js";

const fmtKick = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const EVENT_ICON = { GOAL: "⚽", YELLOW: "🟨", RED: "🟥" };

// Live match minute. Prefer ESPN's clock (live_minute), interpolated with the
// time elapsed since the last refresh so it keeps ticking between polls. Falls
// back to an estimate from the kickoff time. Capped at "90+".
const matchMinute = (m) => {
  if (m.live_minute != null) {
    let min = m.live_minute;
    if (m.updated_at) {
      const since = Math.floor((Date.now() - new Date(m.updated_at).getTime()) / 60000);
      if (since > 0 && since < 20) min += since; // bridge the gap between polls
    }
    return min > 90 ? "90+" : String(min);
  }
  if (!m.kickoff) return null;
  const ms = Date.now() - new Date(m.kickoff).getTime();
  if (ms < 0 || ms > 130 * 60000) return null; // before kickoff or stale
  const min = Math.floor(ms / 60000);
  return min > 90 ? "90+" : String(min);
};

export default function LiveFeed() {
  const [feed, setFeed] = useState({ live: [], next: null, events: [] });

  useEffect(() => {
    let alive = true;
    const load = () => getFeed().then((f) => alive && setFeed(f));
    load();
    const t = setInterval(load, 30000); // live data refreshes faster
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const { live, next, events } = feed;
  const eventsOf = (matchId) => events.filter((e) => e.match_id === matchId);

  if (!live.length && !next) return null;

  return (
    <section className="live-feed">
      {live.map((m) => (
        <div className="feed-card live" key={m.id}>
          <span className="feed-badge live">
            <span className="live-dot" /> EN VIVO
            {matchMinute(m) != null && (
              <span className="live-min">{matchMinute(m)}'</span>
            )}
          </span>
          <div className="feed-main">
            <strong className="feed-score">
              {m.home_team} <span className="sc">{m.live_home ?? 0}</span>
              <span className="dash">-</span>
              <span className="sc">{m.live_away ?? 0}</span> {m.away_team}
            </strong>
            {eventsOf(m.id).length > 0 && (
              <ul className="feed-goals">
                {eventsOf(m.id).map((e, i) => (
                  <li key={i} className={"ev " + e.type.toLowerCase()}>
                    <span className="goal-icon" aria-hidden="true">
                      {EVENT_ICON[e.type] || "•"}
                    </span>
                    {e.minute != null && <span className="goal-min">{e.minute}'</span>}
                    <span className="goal-team">{e.team}</span>
                    {e.player && <span className="goal-player">— {e.player}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}

      {/* Only show what's next when nothing is live right now. */}
      {!live.length && next && (
        <div className="feed-card next">
          <span className="feed-badge next">⏭️ Siguiente</span>
          <div className="feed-main">
            <strong>
              {next.home_team} <em>vs</em> {next.away_team}
            </strong>
            <span className="feed-when">{fmtKick(next.kickoff)}</span>
          </div>
        </div>
      )}
    </section>
  );
}
