import { useEffect, useState } from "react";
import {
  getAnnouncements,
  postAnnouncement,
  deleteAnnouncement,
} from "./api.js";

const fmtWhen = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function Announcements({ adminToken }) {
  const [list, setList] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => getAnnouncements().then(setList);

  useEffect(() => {
    let alive = true;
    getAnnouncements().then((r) => alive && setList(r));
    const t = setInterval(() => alive && getAnnouncements().then(setList), 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await postAnnouncement(adminToken, draft.trim());
      setDraft("");
      await load();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("¿Borrar este aviso?")) return;
    await deleteAnnouncement(adminToken, id);
    await load();
  };

  if (!list.length && !adminToken) return null;

  return (
    <section className="announcements">
      {list.map((a) => (
        <div key={a.id} className="ann-card">
          <span className="ann-icon" aria-hidden="true">📣</span>
          <div className="ann-body">
            <p>{a.message}</p>
            <span className="ann-time">{fmtWhen(a.created_at)}</span>
          </div>
          {adminToken && (
            <button
              className="ann-del"
              onClick={() => remove(a.id)}
              title="Borrar aviso"
              aria-label="Borrar"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {adminToken && (
        <form className="ann-form" onSubmit={submit}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Publicar un aviso para todos…"
            rows={2}
            maxLength={500}
          />
          <button type="submit" disabled={busy || !draft.trim()}>
            {busy ? "Publicando…" : "Publicar"}
          </button>
        </form>
      )}
    </section>
  );
}
