import { useEffect, useState } from "react";
import { getStandings } from "../api.js";

export default function Standings({ poolId }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = () => getStandings(poolId).then((r) => alive && setRows(r));
    load();
    const t = setInterval(load, 60000); // refresh live every minute
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [poolId]);

  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "");

  return (
    <div className="card">
      <table className="table standings">
        <thead>
          <tr>
            <th>#</th>
            <th>Jugador</th>
            <th>Puntos</th>
            <th>Exactos</th>
            <th>Resultado</th>
            <th>Jugados</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.player_id} className={i === 0 ? "leader" : ""}>
              <td>{medal(i) || i + 1}</td>
              <td className="name">{r.name}</td>
              <td className="pts">{r.points}</td>
              <td>{r.exact}</td>
              <td>{r.outcome}</td>
              <td className="muted">{r.played}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
