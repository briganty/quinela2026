import { useEffect, useState } from "react";
import { getMatches } from "../api.js";

const fmtDay = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
};
const fmtTime = (iso) =>
  iso
    ? new Date(iso).toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export default function Fixture() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = () => getMatches().then((m) => alive && setMatches(m));
    load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // group by calendar day
  const days = {};
  for (const m of matches) {
    const key = (m.kickoff || "").slice(0, 10);
    (days[key] ||= []).push(m);
  }

  return (
    <div className="fixture">
      {Object.keys(days)
        .sort()
        .map((day) => (
          <div className="card day" key={day}>
            <h3 className="day-title">{fmtDay(day + "T00:00:00")}</h3>
            {days[day].map((m) => (
              <div className="match-row" key={m.id}>
                <span className="time">{fmtTime(m.kickoff)}</span>
                <span className="grp">{m.group_code}</span>
                <span className="teams home">{m.home_team}</span>
                <span className="score">
                  {m.official_home != null
                    ? `${m.official_home} - ${m.official_away}`
                    : m.status === "LIVE"
                    ? "• vivo"
                    : "vs"}
                </span>
                <span className="teams away">{m.away_team}</span>
                {m.status === "FINISHED" && <span className="tag done">FT</span>}
                {m.status === "LIVE" && <span className="tag live">LIVE</span>}
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
