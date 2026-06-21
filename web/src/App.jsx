import { useEffect, useState } from "react";
import { getPools, checkAdmin } from "./api.js";
import Standings from "./pages/Standings.jsx";
import PredictionGrid from "./pages/PredictionGrid.jsx";
import Fixture from "./pages/Fixture.jsx";
import Groups from "./pages/Groups.jsx";
import AdminLogin from "./AdminLogin.jsx";
import Announcements from "./Announcements.jsx";
import LiveFeed from "./LiveFeed.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import Settings from "./Settings.jsx";

const VIEWS = [
  { id: "standings", label: "Posiciones", icon: "🏆" },
  { id: "grid", label: "Pronósticos", icon: "📋" },
  { id: "fixture", label: "Calendario", icon: "🗓️" },
  { id: "groups", label: "Grupos", icon: "🌍" },
];

const ADMIN_KEY = "quiniela:admin_token";

export default function App() {
  const [pools, setPools] = useState([]);
  const [poolId, setPoolId] = useState(null);
  const [view, setView] = useState("standings");
  const [adminToken, setAdminToken] = useState(() =>
    localStorage.getItem(ADMIN_KEY) || null
  );

  useEffect(() => {
    getPools().then((p) => {
      setPools(p);
      if (p.length) setPoolId(p[0].id);
    });
  }, []);

  // Re-verify stored token on load so we don't keep a stale one.
  useEffect(() => {
    if (!adminToken) return;
    checkAdmin(adminToken).then((ok) => {
      if (!ok) {
        localStorage.removeItem(ADMIN_KEY);
        setAdminToken(null);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdminChange = (t) => {
    if (t) localStorage.setItem(ADMIN_KEY, t);
    else localStorage.removeItem(ADMIN_KEY);
    setAdminToken(t);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="admin-bar">
          <ThemeToggle />
          <Settings adminToken={adminToken} />
          <AdminLogin token={adminToken} onChange={handleAdminChange} />
        </div>
        <img className="logo" src="/logo.png" alt="Quiniela Rojas Briganty" />
        <p className="subtitle">Mundial 2026 · 3 pts marcador exacto · 1 pt resultado</p>
      </header>

      <nav className="tabs pools">
        {pools.map((p) => (
          <button
            key={p.id}
            className={p.id === poolId ? "tab active" : "tab"}
            onClick={() => setPoolId(p.id)}
          >
            {p.name}
          </button>
        ))}
      </nav>

      <nav className="tabs views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={v.id === view ? "tab active" : "tab"}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      <LiveFeed />
      <Announcements adminToken={adminToken} />

      <main className="content">
        {view === "fixture" ? (
          <Fixture />
        ) : view === "groups" ? (
          <Groups />
        ) : poolId == null ? (
          <p className="muted">Cargando…</p>
        ) : view === "standings" ? (
          <Standings poolId={poolId} />
        ) : (
          <PredictionGrid poolId={poolId} adminToken={adminToken} />
        )}
      </main>

      <footer className="footer">
        <span className="muted">Los marcadores se actualizan automáticamente tras cada partido.</span>
      </footer>

      <nav className="bottom-nav" aria-label="Navegación">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={v.id === view ? "active" : ""}
            onClick={() => setView(v.id)}
            aria-label={v.label}
          >
            <span className="ico" aria-hidden="true">{v.icon}</span>
            <span>{v.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
