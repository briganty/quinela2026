import { useEffect, useState } from "react";

const KEY = "quiniela:theme";

function apply(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#000000" : "#f4f6fb");
}

export function initTheme() {
  const stored = localStorage.getItem(KEY) || "dark";
  apply(stored);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem(KEY) || "dark"
  );

  useEffect(() => {
    apply(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(next)}
      title={`Cambiar a tema ${next === "dark" ? "oscuro" : "claro"}`}
      aria-label="Cambiar tema"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
