import { useEffect, useState } from "react";
import { getSettings, saveSettings, adminRefresh } from "./api.js";

export default function Settings({ adminToken }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [newKey, setNewKey] = useState("");
  const [provider, setProvider] = useState("football-data");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open) return;
    setStatus("");
    setNewKey("");
    getSettings(adminToken)
      .then((s) => {
        setData(s);
        setProvider(s.football_provider);
      })
      .catch((e) => setStatus("Error: " + e.message));
  }, [open, adminToken]);

  const save = async (e) => {
    e?.preventDefault?.();
    setBusy(true);
    setStatus("");
    try {
      const body = { football_provider: provider };
      if (newKey.trim()) body.football_api_key = newKey.trim();
      await saveSettings(adminToken, body);
      const r = await adminRefresh(adminToken);
      if (r.error) setStatus("Guardado, pero refresh falló: " + r.error);
      else if (r.skipped) setStatus("Guardado. Refresh: " + r.skipped);
      else
        setStatus(
          `OK — ${r.matched} grupos / ${r.ko?.matched || 0} eliminatorias procesados.`
        );
      const s = await getSettings(adminToken);
      setData(s);
      setNewKey("");
    } catch (e) {
      setStatus("Error: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async () => {
    if (!confirm("¿Borrar la API key guardada?")) return;
    setBusy(true);
    try {
      await saveSettings(adminToken, { football_api_key: "" });
      const s = await getSettings(adminToken);
      setData(s);
      setStatus("Key borrada. Auto-update queda inactivo.");
    } catch (e) {
      setStatus("Error: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!adminToken) return null;

  return (
    <>
      <button
        className="settings-pill"
        onClick={() => setOpen(true)}
        title="Configuración"
        aria-label="Configuración"
      >
        ⚙
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form
            className="modal settings-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
          >
            <h3>Configuración</h3>
            <p className="muted">Auto-actualización de marcadores.</p>

            <label className="settings-label">
              <span>Proveedor</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="football-data">football-data.org</option>
                <option value="api-sports">api-football.com (API-Sports)</option>
                <option value="espn">ESPN (gratis, sin key · goles + tarjetas)</option>
              </select>
            </label>
            {provider === "espn" && (
              <p className="muted settings-hint">
                ESPN no necesita API key. Trae marcadores, goleadores y tarjetas
                (fuente no oficial; puede fallar sin aviso).
              </p>
            )}

            <label className="settings-label">
              <span>API key actual</span>
              <div className="settings-current">
                {data?.football_api_key_set ? (
                  <code>{data.football_api_key_masked}</code>
                ) : (
                  <span className="muted">No configurada</span>
                )}
                {data?.football_api_key_set && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={clearKey}
                    disabled={busy}
                  >
                    Borrar
                  </button>
                )}
              </div>
            </label>

            <label className="settings-label">
              <span>Nueva API key (dejar vacío para no cambiar)</span>
              <input
                type="password"
                placeholder="Pega la nueva key aquí"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                autoComplete="off"
              />
            </label>

            {status && <p className="settings-status">{status}</p>}

            <div className="modal-actions">
              <button type="button" onClick={() => setOpen(false)}>
                Cerrar
              </button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar y probar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
