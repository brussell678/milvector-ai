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
    // Supabase/default provider can enforce longer windows than 60s.
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to send sign-in link";
      setDisplayError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  const notificationText = displayError ?? message;
  const notificationClass = displayError ? "alert-base alert-error" : "alert-base alert-success";

  return (
    <section className="panel w-full p-8 md:p-10">
      <div className="flex items-center gap-3">
        <Image
          src="/assets/milvector-ai-logo-transparent.png"
          alt="MILVECTOR AI logo"
          width={56}
          height={56}
          className="object-contain"
        />
        <p className="text-xs font-semibold tracking-wider text-[var(--accent)]">MILVECTOR AI</p>
      </div>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Sign in to your workspace</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        We send a secure magic link. No password required.
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
        <button type="submit" className="btn btn-primary" disabled={loading || cooldownSeconds > 0}>
          {loading ? "Sending..." : cooldownSeconds > 0 ? `Retry in ${cooldownSeconds}s` : "Send magic link"}
        </button>
      </form>
      {notificationText && <p className={`mt-4 ${notificationClass}`}>{notificationText}</p>}
      <p className="mt-6 text-sm text-[var(--muted)]">
        Need context first? <Link href="/" className="font-semibold text-[var(--accent)]">View overview</Link>
      </p>
    </section>
  );
}
