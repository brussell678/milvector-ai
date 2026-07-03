"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LoadingBlock } from "@/components/tools/loading-block";
import { ToolAlert } from "@/components/tools/tool-alert";

// ─── Types ────────────────────────────────────────────────────────────

type CivilianRole = {
  title: string;
  why_fit: string;
  common_industries: string[];
  keywords: string[];
};

type RecommendedCert = {
  name: string;
  why: string;
  time_to_get: string;
};

type Output = {
  runId: string | null;
  civilian_roles: CivilianRole[];
  recommended_certs: RecommendedCert[];
};

// ─── Helpers ──────────────────────────────────────────────────────────

const CONFIDENCE_LABELS = ["Best Match", "Strong Match", "Good Match"];

function confidenceLabel(idx: number): string {
  return CONFIDENCE_LABELS[idx] ?? "Match";
}

// ─── Sub-components ───────────────────────────────────────────────────

function RoleCard({ role, idx }: { role: CivilianRole; idx: number }) {
  const label = confidenceLabel(idx);
  const targeterHref = `/app/tools/resume-targeter?title=${encodeURIComponent(role.title)}`;
  const foundationHref = `/app/tools/fitrep-bullets?role=${encodeURIComponent(role.title)}`;

  return (
    <article className="subtle-panel flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-bold text-base leading-tight">{role.title}</h3>
        <span
          className={`tool-badge shrink-0 mt-0.5 ${
            idx === 0 ? "tool-badge-success" : idx === 1 ? "tool-badge-success" : "tool-badge-warn"
          }`}
          style={{ fontSize: "0.65rem", opacity: idx > 1 ? 0.8 : 1 }}
        >
          {label}
        </span>
      </div>

      {/* Why fit */}
      <p className="text-sm leading-relaxed text-[var(--muted)]">{role.why_fit}</p>

      {/* Industries */}
      {role.common_industries.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {role.common_industries.map((ind) => (
            <span
              key={ind}
              className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-0.5 text-xs text-[var(--muted)]"
            >
              {ind}
            </span>
          ))}
        </div>
      )}

      {/* Keywords */}
      {role.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {role.keywords.map((kw) => (
            <span
              key={kw}
              className="rounded-full border border-[color-mix(in_oklab,var(--accent)_35%,var(--line)_65%)] bg-[color-mix(in_oklab,var(--accent-soft)_60%,var(--surface)_40%)] px-2.5 py-0.5 text-xs font-medium text-[var(--accent)]"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Cross-tool CTAs */}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Link href={targeterHref} className="btn btn-primary text-xs">
          Build Resume for this Role →
        </Link>
        <Link href={foundationHref} className="btn btn-secondary text-xs">
          Set as Target Role
        </Link>
      </div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

function MosTranslatorContent() {
  const searchParams = useSearchParams();
  const [mos, setMos] = useState("");
  const [billets, setBillets] = useState("");
  const [yearsExp, setYearsExp] = useState("");
  const [interests, setInterests] = useState("");
  const [result, setResult] = useState<Output | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [fromWelcome, setFromWelcome] = useState(false);

  // Pre-fill from ?mos= (set by the welcome flow and the new-user dashboard)
  useEffect(() => {
    const mosParam = searchParams.get("mos");
    if (mosParam) setMos(decodeURIComponent(mosParam));
    if (searchParams.get("welcome") === "1") setFromWelcome(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(`${label} copied`);
    } catch {
      setCopyState(`Could not copy ${label.toLowerCase()}`);
    }
    setTimeout(() => setCopyState(""), 1500);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    setCopyState("");

    const payload = {
      mos,
      billets: billets
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      yearsExp: yearsExp ? Number(yearsExp) : null,
      interests: interests
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    };

    try {
      const res = await fetch("/api/tools/mos-translator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong on our end. Your inputs are still here — try again in a few seconds.");
        return;
      }
      setResult(data as Output);
    } catch {
      setError("That didn't go through. Check your connection and try again — your inputs are still here.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">MOS TRANSLATOR</p>
            <h1 className="page-title">
              Translate military experience into{" "}
              <span className="gradient-text">civilian role paths.</span>
            </h1>
            <p className="page-description">
              Map MOS, billets, years of experience, and interests into civilian roles, keywords, industries, and certification next steps.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">WHAT YOU GET</p>
            <ul className="page-hero-list">
              <li>Civilian jobs that match your experience, ranked by fit</li>
              <li>The keywords and industries for each job</li>
              <li>One-click handoff into the resume tools</li>
              <li>Certifications worth getting, with timelines</li>
            </ul>
          </aside>
        </div>
        <div className="hero-trust-strip -mx-7 -mb-7 mt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {["Role Matches", "Keyword Mapping", "Industry Fit", "Cert Roadmap"].map((label) => (
              <div key={label} className="hero-trust-item">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "#39a67f" }}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.65)" }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tool layout ────────────────────────────────────────────── */}
      <div className="tool-shell">

        {/* ── INPUT PANEL ────────────────────────────────────────── */}
        <div className="tool-input-panel">
          {fromWelcome && !result && (
            <ToolAlert variant="info" title="Welcome aboard — here's your first win">
              <p className="text-sm">
                {mos
                  ? `Your MOS (${mos}) is loaded. Hit Translate and see the civilian jobs that match your experience — takes about 30 seconds.`
                  : "Enter your MOS and hit Translate to see the civilian jobs that match your experience — takes about 30 seconds."}
              </p>
            </ToolAlert>
          )}
          <section className="tool-section">
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div>
                <p className="tool-kicker">INPUTS</p>
                <p className="section-description mt-1">
                  MOS is required. Billets and interests sharpen the role matching — add them when you have them.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">MOS / Rate / AFSC</span>
                  <input
                    className="input"
                    value={mos}
                    onChange={(e) => setMos(e.target.value)}
                    placeholder="e.g. 0311, 11B, 25B"
                    required
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    Years Experience{" "}
                    <span className="font-normal text-[var(--muted)]">(optional)</span>
                  </span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={40}
                    value={yearsExp}
                    onChange={(e) => setYearsExp(e.target.value)}
                    placeholder="e.g. 8"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  Billets / Key Assignments{" "}
                  <span className="font-normal text-[var(--muted)]">(comma-separated, optional)</span>
                </span>
                <input
                  className="input"
                  value={billets}
                  onChange={(e) => setBillets(e.target.value)}
                  placeholder="e.g. Platoon Commander, S3 Operations, Training Officer"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  Civilian Interests{" "}
                  <span className="font-normal text-[var(--muted)]">(comma-separated, optional)</span>
                </span>
                <input
                  className="input"
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder="e.g. technology, project management, consulting"
                />
              </label>

              <button
                className="btn btn-primary w-full sm:w-auto"
                type="submit"
                disabled={loading}
              >
                {loading ? "Translating…" : "Translate MOS"}
              </button>
            </form>
          </section>

          {/* Quick-copy after result */}
          {result && !loading && (
            <section className="tool-section">
              <p className="tool-kicker">ACTIONS</p>
              <button
                className="btn btn-secondary w-full text-sm"
                type="button"
                onClick={() =>
                  void copyText(
                    "Roles",
                    result.civilian_roles
                      .map((r) => `${r.title}: ${r.why_fit}`)
                      .join("\n\n")
                  )
                }
              >
                Copy All Role Summaries
              </button>
              {copyState && (
                <p className="text-sm font-medium text-[var(--accent)]">{copyState}</p>
              )}
            </section>
          )}
        </div>

        {/* ── OUTPUT PANEL ───────────────────────────────────────── */}
        <div className="tool-output-panel">

          {/* Loading */}
          {loading && (
            <LoadingBlock
              task="Translating MOS experience…"
              detail="Mapping military roles to civilian titles, industries, and keywords. Usually takes 15–25 seconds."
            />
          )}

          {/* Error */}
          {!loading && error && (
            <ToolAlert variant="error" title="Translation failed">
              <p className="text-sm">{error}</p>
            </ToolAlert>
          )}

          {/* ── Civilian role cards ───────────────────────────────── */}
          {!loading && result && result.civilian_roles.length > 0 && (
            <div className="tool-output-card">
              <div>
                <p className="tool-kicker">CIVILIAN ROLES</p>
                <p className="section-title mt-0.5">Your Role Matches</p>
                <p className="section-description">
                  Ranked by fit. Use the buttons on each card to start a resume for that job.
                </p>
              </div>
              <div className="grid gap-3">
                {result.civilian_roles.map((role, idx) => (
                  <RoleCard key={role.title} role={role} idx={idx} />
                ))}
              </div>
            </div>
          )}

          {/* ── Recommended certs ────────────────────────────────── */}
          {!loading && result && result.recommended_certs.length > 0 && (
            <div className="tool-output-card">
              <div>
                <p className="tool-kicker">CERTIFICATIONS</p>
                <p className="section-title mt-0.5">Recommended Next Steps</p>
                <p className="section-description">
                  Certifications that strengthen your candidacy for these civilian paths.
                </p>
              </div>
              <div className="grid gap-3">
                {result.recommended_certs.map((cert) => (
                  <div
                    key={cert.name}
                    className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-sm">{cert.name}</p>
                      <span className="tool-badge tool-badge-warn shrink-0" style={{ fontSize: "0.65rem" }}>
                        {cert.time_to_get}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-[var(--muted)] leading-relaxed">{cert.why}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !result && !error && (
            <div className="tool-empty">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--line)]"
                aria-hidden="true"
              >
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
              </svg>
              <p className="font-medium">Role matches will appear here</p>
              <p className="text-sm">
                Enter your MOS on the left and hit Translate. Here&apos;s the kind of result you&apos;ll get:
              </p>
              <div className="tool-example">
                <p className="tool-example-kicker">Example</p>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-[var(--foreground)]">Operations Manager</p>
                  <span className="tool-badge tool-badge-success" style={{ fontSize: "0.6rem" }}>Best Match</span>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Your platoon leadership and maintenance management map directly to running teams, schedules, and equipment in civilian operations.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {["team leadership", "logistics", "process improvement"].map((kw) => (
                    <span key={kw} className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function MosTranslatorPage() {
  return (
    <Suspense fallback={<div className="page-shell" />}>
      <MosTranslatorContent />
    </Suspense>
  );
}
