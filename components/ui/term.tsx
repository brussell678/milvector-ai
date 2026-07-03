"use client";

import { ReactNode, useState } from "react";
import { GLOSSARY, GlossaryKey } from "@/lib/glossary";

// Wraps a piece of civilian hiring jargon with a dotted underline and a
// plain-English explanation on tap, hover, or keyboard focus.
export function Term({ k, children }: { k: GlossaryKey; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const definition = GLOSSARY[k];

  return (
    <span className="term-wrap">
      <button
        type="button"
        className="term-trigger"
        aria-expanded={open}
        aria-label={`What does this mean? ${definition}`}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </button>
      {open && (
        <span role="tooltip" className="term-pop">
          {definition}
        </span>
      )}
    </span>
  );
}
