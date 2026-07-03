"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

const BRANCHES = ["USMC", "Army", "Navy", "Air Force", "Coast Guard", "Space Force"];

const GOALS = [
  {
    value: "civilian_job",
    title: "Find a civilian job",
    detail: "Translate my experience and start applying.",
  },
  {
    value: "education",
    title: "School or training",
    detail: "Use my benefits for a degree or certification first.",
  },
  {
    value: "not_sure",
    title: "Not sure yet",
    detail: "Show me my options — I'm still figuring it out.",
  },
] as const;

type GoalValue = (typeof GOALS)[number]["value"];

export function WelcomeFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [easDate, setEasDate] = useState("");
  const [branch, setBranch] = useState("USMC");
  const [rank, setRank] = useState("");
  const [mos, setMos] = useState("");
  const [goal, setGoal] = useState<GoalValue | null>(null);

  // Existing accounts that already have service info skip the welcome flow.
  useEffect(() => {
    async function grandfatherExistingUsers() {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        const profile = data?.profile;
        if (profile && (profile.mos || profile.eas_date)) {
          const supabase = supabaseBrowser();
          await supabase.auth.updateUser({ data: { onboarded: true } });
          router.replace("/app");
          return;
        }
      } catch {
        // fall through to the welcome flow
      }
      setChecking(false);
    }
    void grandfatherExistingUsers();
  }, [router]);

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sync-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch: branch || null,
          eas_date: easDate || null,
          rank: rank.trim() || null,
          mos: mos.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "That didn't save. Try again in a few seconds.");
        setSaving(false);
        return;
      }

      const supabase = supabaseBrowser();
      await supabase.auth.updateUser({
        data: { onboarded: true, transition_goal: goal ?? "not_sure" },
      });

      if (mos.trim()) {
        router.replace(`/app/tools/mos-translator?mos=${encodeURIComponent(mos.trim())}&welcome=1`);
      } else {
        router.replace("/app");
      }
    } catch {
      setError("That didn't go through. Check your connection and try again.");
      setSaving(false);
    }
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-[var(--muted)]">Setting up your workspace…</p>
      </main>
    );
  }

  const steps = ["Your date", "Your service", "Your goal"];

  return (
    <main className="flex min-h-screen items-start justify-center bg-[var(--background)] px-4 py-10 sm:items-center">
      <div className="w-full max-w-xl">

        {/* Brand header */}
        <div className="mb-6 flex items-center gap-3">
          <Image
            src="/assets/milvector-ai-logo-transparent.png"
            alt="MILVECTOR AI logo"
            width={40}
            height={40}
            className="object-contain"
          />
          <div>
            <p className="text-xs font-semibold tracking-[0.24em] text-[var(--accent)]">MILVECTOR AI</p>
            <p className="text-xs text-[var(--muted)]">Welcome aboard</p>
          </div>
        </div>

        <section className="panel p-6 sm:p-8">

          {/* Progress */}
          <div className="mb-6 flex items-center gap-2" aria-label={`Step ${step + 1} of 3`}>
            {steps.map((label, i) => (
              <div key={label} className="flex flex-1 flex-col gap-1.5">
                <span
                  className={`h-1.5 rounded-full transition-colors ${
                    i <= step ? "bg-[var(--accent)]" : "bg-[var(--line)]"
                  }`}
                  aria-hidden="true"
                />
                <span className={`text-[11px] font-semibold uppercase tracking-wide ${i === step ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* ── Step 1: EAS date ─────────────────────────────────── */}
          {step === 0 && (
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">When do you get out?</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Your EAS or retirement date sets your countdown and unlocks your transition timeline. If you don&apos;t know it yet, skip this — you can add it any time.
              </p>
              <label className="mt-5 block space-y-1">
                <span className="text-sm font-medium">EAS / retirement date</span>
                <input
                  className="input"
                  type="date"
                  value={easDate}
                  onChange={(e) => setEasDate(e.target.value)}
                />
              </label>
              <div className="mt-6 flex items-center justify-between gap-3">
                <button type="button" className="text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]" onClick={() => setStep(1)}>
                  Skip for now
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setStep(1)}>
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Service ──────────────────────────────────── */}
          {step === 1 && (
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">What&apos;s your MOS and rank?</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Your MOS lets the tools translate your actual experience — this is what makes your first result feel like it was written about you.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Branch</span>
                  <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
                    {BRANCHES.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Rank</span>
                  <input className="input" value={rank} onChange={(e) => setRank(e.target.value)} placeholder="e.g. Sgt, SSgt, Capt" />
                </label>
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-sm font-medium">MOS / rate / AFSC</span>
                  <input className="input" value={mos} onChange={(e) => setMos(e.target.value)} placeholder="e.g. 0311, 3531, 25B" />
                </label>
              </div>
              <div className="mt-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <button type="button" className="text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]" onClick={() => setStep(0)}>
                    Back
                  </button>
                  <button type="button" className="text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]" onClick={() => setStep(2)}>
                    Skip for now
                  </button>
                </div>
                <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Goal ─────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">What&apos;s next for you?</h1>
              <p className="mt-2 text-sm text-[var(--muted)]">
                No wrong answer here — this just helps point you at the right first tool.
              </p>
              <div className="mt-5 grid gap-3">
                {GOALS.map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setGoal(g.value)}
                    className="rounded-xl border p-4 text-left transition-colors"
                    style={{
                      borderColor: goal === g.value ? "var(--accent)" : "var(--line)",
                      background: goal === g.value ? "var(--accent-soft)" : "var(--surface)",
                    }}
                    aria-pressed={goal === g.value}
                  >
                    <p className="font-bold">{g.title}</p>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">{g.detail}</p>
                  </button>
                ))}
              </div>

              {error ? <p className="alert-base alert-error mt-4">{error}</p> : null}

              <div className="mt-6 flex items-center justify-between gap-3">
                <button type="button" className="text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]" onClick={() => setStep(1)}>
                  Back
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void finish()} disabled={saving}>
                  {saving ? "Setting up…" : mos.trim() ? "Finish — see my first result" : "Finish setup"}
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          Everything here is optional and stays private to your account. You can change it any time in your Profile.
        </p>
      </div>
    </main>
  );
}
