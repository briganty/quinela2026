import { useEffect, useState } from "react";
import { getStandings } from "../api.js";

export default function Standings({ poolId }) {
  const [data, setData] = useState({ rows: [], liveMatches: [] });

  useEffect(() => {
    let alive = true;
    const load = () => getStandings(poolId).then((r) => alive && setData(r));
    load();
    const t = setInterval(load, 60000); // refresh live every minute
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [poolId]);

  const { rows, liveMatches } = data;
  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "");
  const anyLive = liveMatches.length > 0;
  const multiLive = liveMatches.length > 1;

  // 3-letter team code so simultaneous live columns stay distinguishable.
  const code = (name) =>
    String(name || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 3)
      .toUpperCase();

  return (
    <div className="card scroll">
      <table className="table standings">
        <thead>
          <tr>
            <th>#</th>
            <th>Jugador</th>
            <th>Puntos</th>
            <th>Exactos</th>
            <th>Resultado</th>
            <th>Jugados</th>
            {liveMatches.map((lm) => (
              <th
                key={lm.pool_match_id}
                className="live-col"
                title={`${lm.home_team} vs ${lm.away_team}`}
              >
                <span className="live-dot" />{" "}
                {multiLive
                  ? `${code(lm.home_team)}–${code(lm.away_team)}`
                  : "Pronóstico"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.player_id} className={i === 0 ? "leader" : ""}>
              <td>{medal(i) || i + 1}</td>
              <td className="name">{r.name}</td>
              <td className="pts">
                {r.points}
                {r.livePoints > 0 && (
                  <span
                    className="live-delta"
                    title="Puntos provisionales de partidos en vivo"
                  >
                    +{r.livePoints}
                  </span>
                )}
              </td>
              <td>{r.exact}</td>
              <td>{r.outcome}</td>
              <td className="muted">{r.played}</td>
              {liveMatches.map((lm) => {
                const pred = lm.preds[r.player_id];
                return (
                  <td key={lm.pool_match_id} className="live-col live-pred">
                    {pred ? (
                      <span className="pred">{pred}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {anyLive && (
        <p className="live-note">
          <span className="live-dot" /> Columna por partido en vivo con el
          pronóstico de cada quien. En rojo (+), lo que sumaría al total si
          termina así.
        </p>
      )}
    </div>
  );
}
