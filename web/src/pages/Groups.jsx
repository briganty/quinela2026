import { useEffect, useState } from "react";
import { getGroups } from "../api.js";

export default function Groups() {
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = () => getGroups().then((g) => alive && setGroups(g));
    load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="groups">
      {groups.map((g) => (
        <div className="card group-card" key={g.code}>
          <h3 className="group-title">Grupo {g.code}</h3>
          <table className="table group-table">
            <thead>
              <tr>
                <th className="pos">#</th>
                <th className="name">Equipo</th>
                <th>PJ</th>
                <th>G</th>
                <th>E</th>
                <th>P</th>
                <th>GF</th>
                <th>GC</th>
                <th>DG</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {g.teams.map((t, i) => (
                <tr key={t.team} className={i < 2 ? "qualify" : ""}>
                  <td className="pos">{i + 1}</td>
                  <td className="name">{t.team}</td>
                  <td>{t.played}</td>
                  <td>{t.won}</td>
                  <td>{t.drawn}</td>
                  <td>{t.lost}</td>
                  <td>{t.gf}</td>
                  <td>{t.ga}</td>
                  <td>{t.gd > 0 ? `+${t.gd}` : t.gd}</td>
                  <td className="pts">{t.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
