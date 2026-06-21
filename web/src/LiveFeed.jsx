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
