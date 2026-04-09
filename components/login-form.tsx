"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabase/client";

export function LoginForm({ error }: { error?: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [displayError, setDisplayError] = useState<string | null>(
    error === "missing_token"
      ? "Login link expired or malformed. Request a fresh magic link below."
      : error ?? null
  );

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/auth/confirm?next=/app`;
  }, []);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [now, setNow] = useState<number>(() => Date.now());
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function getCooldownMsFromRateLimitMessage(msg: string) {
    const lower = msg.toLowerCase();
    const secMatch = lower.match(/(\d+)\s*seconds?/);
    if (secMatch) return Number(secMatch[1]) * 1000;
    const minMatch = lower.match(/(\d+)\s*minutes?/);
    if (minMatch) return Number(minMatch[1]) * 60_000;
    return 5 * 60_000;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (cooldownSeconds > 0) return;
    setDisplayError(null);
    setMessage(null);
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (authError) {
        if (authError.message.toLowerCase().includes("rate")) {
          const ms = getCooldownMsFromRateLimitMessage(authError.message);
          const until = Date.now() + ms;
          setCooldownUntil(until);
          setDisplayError(
            `Email rate limit exceeded. Please wait about ${Math.ceil(ms / 1000)} seconds and try again.`
          );
          return;
        }
        setDisplayError(authError.message);
        return;
      }
      setCooldownUntil(Date.now() + 60_000);
      setMessage("Check your email for the sign-in link.");
    } catch (submitError) {
      const errorMessage = submitError instanceof Error ? submitError.message : "Failed to send sign-in link";
      setDisplayError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  const notificationText = displayError ?? message;
  const notificationClass = displayError ? "alert-base alert-error" : "alert-base alert-success";

  return (
    <section className="panel w-full overflow-hidden p-0">
      <div className="grid gap-0 md:grid-cols-[1.05fr_0.95fr]">
        <div className="relative border-b border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(83,181,134,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] p-8 md:border-b-0 md:border-r md:p-10">
          <div className="flex items-center gap-3">
            <Image
              src="/assets/milvector-ai-logo-transparent.png"
              alt="MILVECTOR AI logo"
              width={56}
              height={56}
              className="object-contain"
            />
            <div>
              <p className="text-xs font-semibold tracking-[0.24em] text-[var(--accent)]">MILVECTOR AI</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Built by Marines for service members</p>
            </div>
          </div>
          <h1 className="mt-8 max-w-md text-3xl font-extrabold tracking-tight md:text-4xl">
            Start with a workspace built for transition, not guesswork.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)] md:text-base">
            Access your tools, saved documents, timelines, and transition support in one place. Email sign-in helps us keep the platform free,
            protect the tools from bot abuse that can drive up AI API costs, and give you a secure way to return to your workspace without a password.
          </p>
          <div className="mt-8 rounded-xl border border-[var(--line)] bg-[linear-gradient(180deg,rgba(83,181,134,0.08),rgba(255,255,255,0.01))] p-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)]">INSIDE YOUR WORKSPACE</p>
            <div className="mt-4 space-y-4">
              <div className="border-l-2 border-[var(--accent)] pl-4">
                <p className="text-sm font-semibold text-[var(--foreground)]">Translate your record</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Turn military documents and experience into civilian-ready materials.</p>
              </div>
              <div className="border-l-2 border-[var(--accent)] pl-4">
                <p className="text-sm font-semibold text-[var(--foreground)]">Plan the process</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Keep milestones, source documents, and job-targeting work organized in one place.</p>
              </div>
              <div className="border-l-2 border-[var(--accent)] pl-4">
                <p className="text-sm font-semibold text-[var(--foreground)]">Move with confidence</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Use decision, application, and support tools built for the next step.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 md:p-10">
          <p className="text-xs font-semibold tracking-[0.22em] text-[var(--accent)]">SECURE SIGN IN</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight">Open your workspace</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Enter your email and we&apos;ll send you a secure sign-in link. MilVector is free to use, we do not sell your information, and email access helps us keep bots from running up platform costs.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (displayError) setDisplayError(null);
                }}
                placeholder="you@example.com"
              />
            </label>
            <button type="submit" className="btn btn-primary w-full justify-center" disabled={loading || cooldownSeconds > 0}>
              {loading ? "Sending..." : cooldownSeconds > 0 ? `Retry in ${cooldownSeconds}s` : "Send magic link"}
            </button>
          </form>
          {notificationText && <p className={`mt-4 ${notificationClass}`}>{notificationText}</p>}
          <div className="mt-6 rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-4">
            <p className="text-xs font-semibold tracking-wide text-[var(--accent)]">WHY EMAIL SIGN-IN EXISTS</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              It helps protect the platform from automated abuse, keeps AI operating costs manageable, and gives you a reliable way to return to your work later. Access is free, and your information is not sold.
            </p>
          </div>
          <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-4">
            <p className="text-xs font-semibold tracking-wide text-[var(--muted)]">WHAT HAPPENS NEXT</p>
            <ol className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>1. Check your inbox for the magic link.</li>
              <li>2. Open it on this device to enter your workspace.</li>
              <li>3. Start with Tools, Documents, or your transition timeline.</li>
            </ol>
          </div>
          <p className="mt-6 text-sm text-[var(--muted)]">
            Need context first? <Link href="/platform" className="font-semibold text-[var(--accent)]">See how MilVector works</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
