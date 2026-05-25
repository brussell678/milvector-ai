"use client";

import { FormEvent, useState } from "react";

type Output = {
  civilian_roles: { title: string; why_fit: string; common_industries: string[]; keywords: string[] }[];
  recommended_certs: { name: string; why: string; time_to_get: string }[];
};

export default function MosTranslatorPage() {
  const [mos, setMos] = useState("");
  const [billets, setBillets] = useState("");
  const [yearsExp, setYearsExp] = useState("");
  const [interests, setInterests] = useState("");
  const [result, setResult] = useState<Output | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(`${label} copied`);
      setTimeout(() => setCopyState(""), 1500);
    } catch {
      setCopyState(`Could not copy ${label.toLowerCase()}`);
      setTimeout(() => setCopyState(""), 1500);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    const payload = {
      mos,
      billets: billets.split(",").map((x) => x.trim()).filter(Boolean),
      yearsExp: yearsExp ? Number(yearsExp) : null,
      interests: interests.split(",").map((x) => x.trim()).filter(Boolean),
    };

    try {
      const res = await fetch("/api/tools/mos-translator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      setResult(data as Output);
    } catch {
      setError("Network error while translating MOS.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">MOS TRANSLATOR</p>
            <h1 className="page-title">Translate military experience into civilian role paths.</h1>
            <p className="page-description">
              Map MOS, billets, years of experience, and interests into civilian roles, keywords, industries, and certification next steps.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">MOBILE FLOW</p>
            <ul className="page-hero-list">
              <li>Enter MOS and experience</li>
              <li>Add billets or interests if useful</li>
              <li>Generate and copy role matches</li>
            </ul>
          </aside>
        </div>
      </section>
      <section className="section-card">
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <label className="space-y-1">
            <span className="text-sm font-medium">MOS</span>
            <input className="input" value={mos} onChange={(e) => setMos(e.target.value)} required />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Years Experience</span>
            <input className="input" type="number" value={yearsExp} onChange={(e) => setYearsExp(e.target.value)} />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Billets (comma-separated)</span>
            <input className="input" value={billets} onChange={(e) => setBillets(e.target.value)} />
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Interests (comma-separated)</span>
            <input className="input" value={interests} onChange={(e) => setInterests(e.target.value)} />
          </label>
          <div className="md:col-span-2">
            <button className="btn btn-primary w-full sm:w-auto" type="submit" disabled={loading}>
              {loading ? "Translating..." : "Translate MOS"}
            </button>
          </div>
        </form>
      </section>
      {(error || copyState) && (
        <section className="section-card">
          {error && <p className="text-sm text-red-700">{error}</p>}
          {copyState && <p className="text-sm text-[var(--accent)]">{copyState}</p>}
        </section>
      )}
      {result && (
        <section className="section-card space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              className="btn btn-secondary text-sm"
              type="button"
              onClick={() =>
                copyText(
                  "Roles",
                  result.civilian_roles
                    .map((role) => `${role.title}: ${role.why_fit}`)
                    .join("\n")
                )
              }
            >
              Copy Roles
            </button>
          </div>
          <h2 className="font-bold">Civilian Roles</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {result.civilian_roles.map((role) => (
              <article key={role.title} className="rounded-md border border-[var(--line)] p-3">
                <p className="font-semibold">{role.title}</p>
                <p className="text-sm text-[var(--muted)]">{role.why_fit}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Keywords: {role.keywords.join(", ")}</p>
              </article>
            ))}
          </div>
          <div>
            <h3 className="font-bold">Recommended Certs</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {result.recommended_certs.map((cert) => (
                <li key={cert.name}>{cert.name} - {cert.time_to_get}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}
