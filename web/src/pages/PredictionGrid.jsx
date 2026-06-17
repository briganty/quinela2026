import { useEffect, useRef, useState } from "react";
import { getGrid, savePrediction } from "../api.js";

const ptsClass = (p) =>
  p === 3 ? "cell exact" : p === 1 ? "cell outcome" : p === 0 ? "cell miss" : "cell";

function EditCell({ initial, onSave, onCancel }) {
  const [h, setH] = useState(initial?.h ?? "");
  const [a, setA] = useState(initial?.a ?? "");
  const [busy, setBusy] = useState(false);
  const hRef = useRef(null);

  useEffect(() => {
    hRef.current?.focus();
    hRef.current?.select();
  }, []);

  const submit = async (e) => {
    e?.preventDefault?.();
    setBusy(true);
    try {
      await onSave({
        pred_home: h === "" ? null : Number(h),
        pred_away: a === "" ? null : Number(a),
      });
    } catch (err) {
      alert("Error: " + err.message);
      setBusy(false);
    }
  };

  return (
    <form className="cell-editor" onSubmit={submit}>
      <input
        ref={hRef}
        type="number"
        min="0"
        max="20"
        value={h}
        onChange={(e) => setH(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <span>-</span>
      <input
        type="number"
        min="0"
        max="20"
        value={a}
        onChange={(e) => setA(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <button type="submit" disabled={busy} title="Guardar">✓</button>
      <button type="button" onClick={onCancel} title="Cancelar">✕</button>
    </form>
  );
}

export default function PredictionGrid({ poolId, adminToken }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // `${pmId}#${plId}`

  const load = () => getGrid(poolId).then(setData);

  useEffect(() => {
    let alive = true;
    getGrid(poolId).then((d) => alive && setData(d));
    const t = setInterval(() => alive && getGrid(poolId).then(setData), 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [poolId]);

  if (!data) return <p className="muted">Cargando…</p>;
  const { players, rows } = data;

  const save = async (pool_match_id, player_id, payload) => {
    await savePrediction(adminToken, {
      pool_match_id,
      player_id,
      ...payload,
    });
    setEditing(null);
    await load();
  };

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
              {row.cells.map((c) => {
                const key = `${row.pool_match_id}#${c.player_id}`;
                const isEditing = editing === key;
                const editable = !!adminToken;
                const parsed = (() => {
                  if (!c.pred) return null;
                  const [h, a] = c.pred.split("-");
                  return { h, a };
                })();
                return (
                  <td
                    key={c.player_id}
                    className={
                      ptsClass(c.points) + (editable ? " editable" : "")
                    }
                    onClick={() => editable && !isEditing && setEditing(key)}
                  >
                    {isEditing ? (
                      <EditCell
                        initial={parsed}
                        onSave={(p) => save(row.pool_match_id, c.player_id, p)}
                        onCancel={() => setEditing(null)}
                      />
                    ) : c.pred ? (
                      <>
                        <span className="pred">{c.pred}</span>
                        {c.points != null && (
                          <span className="badge">{c.points}</span>
                        )}
                      </>
                    ) : (
                      <span className="muted">{editable ? "+" : "—"}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
