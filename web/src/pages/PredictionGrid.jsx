import { useEffect, useState } from "react";
import { getGrid } from "../api.js";

const ptsClass = (p) =>
  p === 3 ? "cell exact" : p === 1 ? "cell outcome" : p === 0 ? "cell miss" : "cell";

export default function PredictionGrid({ poolId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => getGrid(poolId).then((d) => alive && setData(d));
    load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [poolId]);

  if (!data) return <p className="muted">Cargando…</p>;
  const { players, rows } = data;

  return (
    <div className="card scroll">
      <table className="table grid">
        <thead>
          <tr>
            <th className="sticky-col">Partido</th>
            <th>Oficial</th>
            {players.map((p) => (
              <th key={p.id}>{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.pool_match_id}>
              <td className="sticky-col match">
                <span>
                  {row.home_team} <em>vs</em> {row.away_team}
                </span>
              </td>
              <td className="official">
                {row.official
                  ? `${row.official.home}-${row.official.away}`
                  : row.status === "LIVE"
                  ? "EN VIVO"
                  : "—"}
              </td>
              {row.cells.map((c) => (
                <td key={c.player_id} className={ptsClass(c.points)}>
                  {c.pred ? (
                    <>
                      <span className="pred">{c.pred}</span>
                      {c.points != null && (
                        <span className="badge">{c.points}</span>
                      )}
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
