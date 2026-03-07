"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem("tnm-theme");
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  function toggle() {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
    applyTheme(next);
    window.localStorage.setItem("tnm-theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-secondary !py-1.5 text-xs"
      aria-label="Toggle light and dark mode"
      title={`Switch to ${mode === "light" ? "dark" : "light"} mode`}
    >
      {mode === "light" ? "Dark Mode" : "Light Mode"}
    </button>
  );
}
