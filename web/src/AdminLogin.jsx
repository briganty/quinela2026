import { useState } from "react";
import { checkAdmin } from "./api.js";

export default function AdminLogin({ token, onChange }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const ok = await checkAdmin(value);
    setBusy(false);
    if (!ok) {
      setError("Token inválido");
      return;
    }
    onChange(value);
    setOpen(false);
    setValue("");
  };

  if (token) {
    return (
      <button className="admin-pill" onClick={() => onChange(null)} title="Cerrar sesión">
        ✓ Admin · salir
      </button>
    );
  }

  return (
    <>
      <button className="admin-pill" onClick={() => setOpen(true)}>
        🔒 Admin
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <h3>Acceso admin</h3>
            <p className="muted">
              Ingresa el token para editar los pronósticos.
            </p>
            <input
              type="password"
              autoFocus
              placeholder="Token"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className="primary" disabled={busy || !value}>
                {busy ? "Validando…" : "Entrar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
