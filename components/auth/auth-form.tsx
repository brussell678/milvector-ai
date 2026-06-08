"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

type AuthMode = "password" | "signup" | "magic" | "forgot" | "update-password";

type AuthFormProps = {
  initialError?: string;
  initialMode?: string;
};

type SignupFields = {
  email: string;
  password: string;
  confirmPassword: string;
  branch: string;
  easDate: string;
  rank: string;
  mos: string;
  terminalLeaveStart: string;
  ptadStart: string;
  retirementCeremonyDate: string;
};

const initialSignup: SignupFields = {
  email: "",
  password: "",
  confirmPassword: "",
  branch: "USMC",
  easDate: "",
  rank: "",
  mos: "",
  terminalLeaveStart: "",
  ptadStart: "",
  retirementCeremonyDate: "",
};

function normalizeMode(value?: string): AuthMode {
  if (value === "signup" || value === "magic" || value === "forgot" || value === "update-password") {
    return value;
  }
  return "password";
}

function cooldownMsFromRateLimitMessage(msg: string) {
  const lower = msg.toLowerCase();
  const secMatch = lower.match(/(\d+)\s*seconds?/);
  if (secMatch) return Number(secMatch[1]) * 1000;
  const minMatch = lower.match(/(\d+)\s*minutes?/);
  if (minMatch) return Number(minMatch[1]) * 60_000;
  return 5 * 60_000;
}

async function syncProfile(fields?: Record<string, string | null>) {
  const res = await fetch("/api/auth/sync-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Profile sync failed");
}

export function AuthForm({ initialError, initialMode }: AuthFormProps) {
  const [mode, setMode] = useState<AuthMode>(() => normalizeMode(initialMode));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signup, setSignup] = useState<SignupFields>(initialSignup);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [now, setNow] = useState<number>(() => Date.now());
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const origin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  function beginMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  }

  function validatePasswordPair(pass: string, confirmPass?: string) {
    if (pass.length < 8) return "Password must be at least 8 characters.";
    if (confirmPass !== undefined && pass !== confirmPass) return "Password and confirm password must match.";
    return null;
  }

  async function handlePasswordLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const validation = validatePasswordPair(password);
      if (validation) {
        setError(validation);
        return;
      }

      const supabase = supabaseBrowser();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        return;
      }
      await syncProfile();
      window.location.assign("/app");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const validation = validatePasswordPair(signup.password, signup.confirmPassword);
      if (validation) {
        setError(validation);
        return;
      }
      if (!signup.branch.trim()) {
        setError("Branch is required.");
        return;
      }
      if (!signup.easDate) {
        setError("EAS date is required.");
        return;
      }

      const redirectTo = `${origin}/auth/confirm?next=/app`;
      const onboardingFields = {
        branch: signup.branch.trim(),
        eas_date: signup.easDate,
        rank: signup.rank || null,
        mos: signup.mos || null,
        terminal_leave_start: signup.terminalLeaveStart || null,
        ptad_start: signup.ptadStart || null,
        retirement_ceremony_date: signup.retirementCeremonyDate || null,
      };
      const supabase = supabaseBrowser();
      const { data, error: authError } = await supabase.auth.signUp({
        email: signup.email,
        password: signup.password,
        options: {
          emailRedirectTo: redirectTo,
          data: onboardingFields,
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.session) {
        await syncProfile(onboardingFields);
        window.location.assign("/app");
        return;
      }

      setMessage("Account created. Check your email to confirm access, then return to MilVector.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create account.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    if (cooldownSeconds > 0) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = supabaseBrowser();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${origin}/auth/confirm?next=/app` },
      });

      if (authError) {
        if (authError.message.toLowerCase().includes("rate")) {
          const ms = cooldownMsFromRateLimitMessage(authError.message);
          setCooldownUntil(Date.now() + ms);
          setError(`Email rate limit exceeded. Please wait about ${Math.ceil(ms / 1000)} seconds and try again.`);
          return;
        }
        setError(authError.message);
        return;
      }
      setCooldownUntil(Date.now() + 60_000);
      setMessage("Check your email for the sign-in link.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to send sign-in link.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    if (cooldownSeconds > 0) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const resetNext = encodeURIComponent("/auth?mode=update-password");
      const supabase = supabaseBrowser();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/confirm?next=${resetNext}`,
      });

      if (resetError) {
        if (resetError.message.toLowerCase().includes("rate")) {
          const ms = cooldownMsFromRateLimitMessage(resetError.message);
          setCooldownUntil(Date.now() + ms);
          setError(`Email rate limit exceeded. Please wait about ${Math.ceil(ms / 1000)} seconds and try again.`);
          return;
        }
        setError(resetError.message);
        return;
      }

      setCooldownUntil(Date.now() + 60_000);
      setMessage("Check your email for the password reset link.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to request password reset.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdatePassword(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const validation = validatePasswordPair(newPassword);
      if (validation) {
        setError(validation);
        return;
      }

      const supabase = supabaseBrowser();
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      await syncProfile();
      setMessage("Password updated. Redirecting to your workspace...");
      window.setTimeout(() => window.location.assign("/app"), 600);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update password.");
    } finally {
      setLoading(false);
    }
  }

  const notificationText = error ?? message;
  const notificationClass = error ? "alert-base alert-error" : "alert-base alert-success";

  return (
    <section className="panel w-full overflow-hidden p-0">
      <div className="grid gap-0 md:grid-cols-[1.05fr_0.95fr]">
        <div className="relative border-b border-[var(--line)] bg-[radial-gradient(circle_at_top_left,rgba(83,181,134,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] p-6 sm:p-8 md:border-b-0 md:border-r md:p-10">
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
            Access your tools, saved documents, timelines, and transition support in one place. Password login improves access on restricted networks while magic links remain available as a backup.
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

        <div className="p-6 sm:p-8 md:p-10">
          <p className="text-xs font-semibold tracking-[0.22em] text-[var(--accent)]">SECURE ACCESS</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight">Open your workspace</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Use email and password by default. Magic links remain available if you prefer passwordless access.
          </p>

          {mode !== "update-password" ? (
            <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1 sm:grid-cols-4">
              {([
                ["password", "Password"],
                ["signup", "Sign Up"],
                ["magic", "Magic Link"],
                ["forgot", "Reset"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={mode === value ? "btn btn-primary !min-h-11 !py-2 text-sm" : "btn btn-secondary !min-h-11 !py-2 text-sm"}
                  onClick={() => beginMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {mode === "password" ? (
            <form onSubmit={handlePasswordLogin} className="mt-6 space-y-4">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Email</span>
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Password</span>
                <input className="input" type={showPassword ? "text" : "password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
                Show password
              </label>
              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </button>
              <button type="button" className="btn btn-secondary w-full" onClick={() => beginMode("forgot")}>
                Forgot password?
              </button>
            </form>
          ) : null}

          {mode === "signup" ? (
            <form onSubmit={handleSignup} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-sm font-medium">Email</span>
                  <input className="input" type="email" required value={signup.email} onChange={(e) => setSignup((s) => ({ ...s, email: e.target.value }))} placeholder="you@example.com" />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Password</span>
                  <input className="input" type={showPassword ? "text" : "password"} required minLength={8} value={signup.password} onChange={(e) => setSignup((s) => ({ ...s, password: e.target.value }))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Confirm Password</span>
                  <input className="input" type={showPassword ? "text" : "password"} required minLength={8} value={signup.confirmPassword} onChange={(e) => setSignup((s) => ({ ...s, confirmPassword: e.target.value }))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Branch</span>
                  <input className="input" required value={signup.branch} onChange={(e) => setSignup((s) => ({ ...s, branch: e.target.value }))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">EAS Date</span>
                  <input className="input" type="date" required value={signup.easDate} onChange={(e) => setSignup((s) => ({ ...s, easDate: e.target.value }))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Rank</span>
                  <input className="input" value={signup.rank} onChange={(e) => setSignup((s) => ({ ...s, rank: e.target.value }))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">MOS</span>
                  <input className="input" value={signup.mos} onChange={(e) => setSignup((s) => ({ ...s, mos: e.target.value }))} />
                </label>
              </div>
              <details className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <summary className="cursor-pointer text-sm font-semibold">Refine Your Timeline</summary>
                <p className="mt-2 text-sm text-[var(--muted)]">You can add these later as your transition plan becomes clearer.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium">Terminal Leave</span>
                    <input className="input" type="date" value={signup.terminalLeaveStart} onChange={(e) => setSignup((s) => ({ ...s, terminalLeaveStart: e.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium">PTAD</span>
                    <input className="input" type="date" value={signup.ptadStart} onChange={(e) => setSignup((s) => ({ ...s, ptadStart: e.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-sm font-medium">Retirement Ceremony</span>
                    <input className="input" type="date" value={signup.retirementCeremonyDate} onChange={(e) => setSignup((s) => ({ ...s, retirementCeremonyDate: e.target.value }))} />
                  </label>
                </div>
              </details>
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
                Show passwords
              </label>
              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                {loading ? "Creating account..." : "Create Account"}
              </button>
            </form>
          ) : null}

          {mode === "magic" ? (
            <form onSubmit={handleMagicLink} className="mt-6 space-y-4">
              <div className="alert-base alert-info">
                Magic links may not work on some restricted networks. Use email and password if the link does not open correctly.
              </div>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Email</span>
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <button type="submit" className="btn btn-primary w-full" disabled={loading || cooldownSeconds > 0}>
                {loading ? "Sending..." : cooldownSeconds > 0 ? `Retry in ${cooldownSeconds}s` : "Send Magic Link"}
              </button>
            </form>
          ) : null}

          {mode === "forgot" ? (
            <form onSubmit={handleForgotPassword} className="mt-6 space-y-4">
              <p className="text-sm text-[var(--muted)]">Enter your email and we will send a password reset link.</p>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Email</span>
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <button type="submit" className="btn btn-primary w-full" disabled={loading || cooldownSeconds > 0}>
                {loading ? "Sending..." : cooldownSeconds > 0 ? `Retry in ${cooldownSeconds}s` : "Send Reset Link"}
              </button>
            </form>
          ) : null}

          {mode === "update-password" ? (
            <form onSubmit={handleUpdatePassword} className="mt-6 space-y-4">
              <p className="text-sm text-[var(--muted)]">Enter a new password for your MilVector account.</p>
              <label className="block space-y-1">
                <span className="text-sm font-medium">New Password</span>
                <input className="input" type={showPassword ? "text" : "password"} required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
                Show password
              </label>
              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                {loading ? "Updating..." : "Update Password"}
              </button>
            </form>
          ) : null}

          {notificationText && <p className={`mt-4 ${notificationClass}`}>{notificationText}</p>}

          <p className="mt-6 text-sm text-[var(--muted)]">
            Need context first? <Link href="/platform" className="font-semibold text-[var(--accent)]">See how MilVector works</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
