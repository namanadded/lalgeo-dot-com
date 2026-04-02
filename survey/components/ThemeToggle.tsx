"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function applyTheme(nextTheme: Theme) {
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("lalgeo-theme", nextTheme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const isDark = theme === "dark";

  useEffect(() => {
    const stored = localStorage.getItem("lalgeo-theme");
    const nextTheme: Theme = stored === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <strong>Appearance</strong>
      <p className="muted">Switch the LalGeo SaaS workspace between light and dark mode on this device.</p>
      <button
        type="button"
        className={`theme-toggle ${isDark ? "active" : ""}`.trim()}
        onClick={() => {
          const nextTheme: Theme = isDark ? "light" : "dark";
          setTheme(nextTheme);
          applyTheme(nextTheme);
        }}
        aria-pressed={isDark}
      >
        <span className="theme-toggle-track">
          <span className="theme-toggle-thumb" />
        </span>
        <span className="theme-toggle-copy">
          <span className="theme-toggle-label">Dark mode</span>
          <span className="theme-toggle-value">{isDark ? "On" : "Off"}</span>
        </span>
      </button>
    </div>
  );
}
