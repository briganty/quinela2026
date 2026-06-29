import { useEffect, useRef, useState } from "react";
import { getGrid, savePrediction, setMatchResult, setMatchTeams } from "../api.js";

const PHASE_LABEL = {
  R32: "16vos",
  R16: "8vos",
  QF: "4tos",
  SF: "Semis",
  "3RD": "3er puesto",
  FINAL: "Final",
};

const ptsClass = (p, live) => {
  const base =
    p === 3 ? "cell exact" : p === 1 ? "cell outcome" : p === 0 ? "cell miss" : "cell";
  return live ? base + " live" : base;
};

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

// Inline editor for a match's official result. Inputs are in the row's (pool)
// orientation; the parent converts to canonical before saving. Empty = clear.
function OfficialEditor({ initial, onSave, onCancel }) {
  const [h, setH] = useState(initial?.home ?? "");
  const [a, setA] = useState(initial?.away ?? "");
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
        home: h === "" ? null : Number(h),
        away: a === "" ? null : Number(a),
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
      <button type="submit" disabled={busy} title="Guardar marcador">✓</button>
      <button type="button" onClick={onCancel} title="Cancelar">✕</button>
    </form>
  );
}

// Inline editor for a knockout match's team names (pool orientation). The
// parent converts to canonical before saving.
function TeamsEditor({ home, away, onSave, onCancel }) {
  const [h, setH] = useState(home ?? "");
  const [a, setA] = useState(away ?? "");
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
      await onSave({ home: h.trim(), away: a.trim() });
    } catch (err) {
      alert("Error: " + err.message);
      setBusy(false);
    }
  };

  return (
    <form className="teams-editor" onSubmit={submit}>
      <input
        ref={hRef}
        type="text"
        placeholder="Local"
        value={h}
        onChange={(e) => setH(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <em>vs</em>
      <input
        type="text"
        placeholder="Visitante"
        value={a}
        onChange={(e) => setA(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <button type="submit" disabled={busy} title="Guardar equipos">✓</button>
      <button type="button" onClick={onCancel} title="Cancelar">✕</button>
    </form>
  );
}

export default function PredictionGrid({ poolId, adminToken }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // `${pmId}#${plId}`
  const [editingOff, setEditingOff] = useState(null); // pool_match_id
  const [editingTeams, setEditingTeams] = useState(null); // pool_match_id

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

  // Save the official result. `home`/`away` are in the row's (pool) orientation;
  // flip to canonical when the pool match is reversed before writing the match.
  const saveOfficial = async (row, { home, away }) => {
    const canon = row.reversed
      ? { home: away, away: home }
      : { home, away };
    await setMatchResult(adminToken, row.match_id, canon);
    setEditingOff(null);
    await load();
  };

  // Save knockout team names. Inputs are in the row's (pool) orientation; flip
  // to canonical when the pool match is reversed before writing the match.
  const saveTeams = async (row, { home, away }) => {
    const canon = row.reversed
      ? { home: away, away: home }
      : { home, away };
    await setMatchTeams(adminToken, row.match_id, canon);
    setEditingTeams(null);
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
              {(() => {
                const isKO = row.phase && row.phase !== "GROUP";
                const editableTeams = isKO && !!adminToken && row.match_id != null;
                const isEditingTeams = editingTeams === row.pool_match_id;
                return (
                  <td className="sticky-col match">
                    {isKO && (
                      <span className="phase-tag">
                        {PHASE_LABEL[row.phase] || row.phase}
                      </span>
                    )}
                    {isEditingTeams ? (
                      <TeamsEditor
                        home={row.home_team}
                        away={row.away_team}
                        onSave={(t) => saveTeams(row, t)}
                        onCancel={() => setEditingTeams(null)}
                      />
                    ) : (
                      <span
                        className={editableTeams ? "teams-label editable" : undefined}
                        onClick={() =>
                          editableTeams && setEditingTeams(row.pool_match_id)
                        }
                        title={editableTeams ? "Editar equipos" : undefined}
                      >
                        {row.home_team} <em>vs</em> {row.away_team}
                      </span>
                    )}
                  </td>
                );
              })()}
              {(() => {
                const editableOff = !!adminToken && row.match_id != null;
                const isEditingOff = editingOff === row.pool_match_id;
                return (
                  <td
                    className={"official" + (editableOff ? " editable" : "")}
                    onClick={() =>
                      editableOff && !isEditingOff && setEditingOff(row.pool_match_id)
                    }
                  >
                    {isEditingOff ? (
                      <OfficialEditor
                        initial={row.official}
                        onSave={(p) => saveOfficial(row, p)}
                        onCancel={() => setEditingOff(null)}
                      />
                    ) : row.official ? (
                      `${row.official.home}-${row.official.away}`
                    ) : row.live ? (
                      <span className="live-score">
                        {row.live.home}-{row.live.away}
                        <span className="live-dot" aria-label="en vivo" /> EN VIVO
                      </span>
                    ) : row.status === "LIVE" ? (
                      "EN VIVO"
                    ) : (
                      editableOff ? "+" : "—"
                    )}
                  </td>
                );
              })()}
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
                      ptsClass(c.points, c.live) + (editable ? " editable" : "")
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
