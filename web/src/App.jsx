import { useEffect, useState } from "react";
import { getPools } from "./api.js";
import Standings from "./pages/Standings.jsx";
import PredictionGrid from "./pages/PredictionGrid.jsx";
import Fixture from "./pages/Fixture.jsx";

const VIEWS = [
  { id: "standings", label: "Posiciones" },
  { id: "grid", label: "Pronósticos" },
  { id: "fixture", label: "Calendario" },
];

export default function App() {
  const [pools, setPools] = useState([]);
  const [poolId, setPoolId] = useState(null);
  const [view, setView] = useState("standings");

  useEffect(() => {
    getPools().then((p) => {
      setPools(p);
      if (p.length) setPoolId(p[0].id);
    });
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>⚽ Quiniela Mundial 2026</h1>
        <p className="subtitle">3 pts marcador exacto · 1 pt acertar el resultado</p>
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

      <main className="content">
        {poolId == null ? (
          <p className="muted">Cargando…</p>
        ) : view === "standings" ? (
          <Standings poolId={poolId} />
        ) : view === "grid" ? (
          <PredictionGrid poolId={poolId} />
        ) : (
          <Fixture />
        )}
      </main>

      <footer className="footer">
        <span className="muted">Los marcadores se actualizan automáticamente tras cada partido.</span>
      </footer>
    </div>
  );
}
