"use client";

import { KeyboardEvent, ClipboardEvent, useState } from "react";

type ChipInputProps = {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
};

// Tag-style input: type an item and press Enter (or tap Add) to save it as a
// chip. Pasted lists split on commas and new lines automatically, so nobody
// ever has to format anything by hand.
export function ChipInput({ value, onChange, placeholder, addLabel = "Add" }: ChipInputProps) {
  const [draft, setDraft] = useState("");

  function addItems(raw: string) {
    const items = raw
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => !value.includes(x));
    if (items.length > 0) onChange([...value, ...items]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (draft.trim()) addItems(draft);
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (text.includes(",") || text.includes("\n")) {
      e.preventDefault();
      addItems(draft + text);
    }
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--accent)_35%,var(--line)_65%)] bg-[color-mix(in_oklab,var(--accent-soft)_60%,var(--surface)_40%)] py-1 pl-3 pr-1.5 text-sm text-[var(--accent)]"
            >
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
                onClick={() => onChange(value.filter((x) => x !== item))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => {
            if (draft.trim()) addItems(draft);
          }}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="btn btn-secondary shrink-0 text-sm"
          onClick={() => draft.trim() && addItems(draft)}
        >
          {addLabel}
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">Type one and press Enter — it becomes a tag you can remove any time.</p>
    </div>
  );
}
