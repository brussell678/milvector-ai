"use client";

import { useEffect } from "react";

export function ThemeToggle() {
  // Sync OS-level preference changes when no manual preference is set
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange(e: MediaQueryListEvent) {
      if (!localStorage.getItem("mv-theme")) {
        document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
      }
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    localStorage.setItem("mv-theme", next);
    localStorage.removeItem("tnm-theme");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="theme-toggle"
      aria-label="Toggle light and dark mode"
    >
      {/* Sun — CSS shows this in dark mode (click to return to light) */}
      <svg
        className="theme-icon-sun"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>

      {/* Moon — CSS shows this in light mode (click to go dark) */}
      <svg
        className="theme-icon-moon"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>

      {/* Text label — hidden on desktop, shown full-width in mobile drawer footer */}
      <span className="theme-label" aria-hidden="true">
        <span className="theme-label-light-text">Dark mode</span>
        <span className="theme-label-dark-text">Light mode</span>
      </span>
    </button>
  );
}
