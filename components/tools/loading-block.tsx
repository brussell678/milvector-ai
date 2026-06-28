"use client";

import { useEffect, useState } from "react";

type Props = {
  task?: string;
  detail?: string;
};

export function LoadingBlock({ task = "Processing...", detail }: Props) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timer = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div className="tool-loading-block">
      <svg
        className="tool-progress-ring"
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="14"
          cy="14"
          r="11"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeOpacity="0.2"
        />
        <path
          d="M14 3 A11 11 0 0 1 25 14"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <p className="tool-loading-title">{task}</p>
      {detail && <p className="tool-loading-sub">{detail}</p>}
      <span className="tool-loading-timer" aria-live="polite" aria-label={`Elapsed: ${timer}`}>
        {timer}
      </span>
    </div>
  );
}
