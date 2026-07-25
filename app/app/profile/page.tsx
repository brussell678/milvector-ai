"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { ChipInput } from "@/components/ui/chip-input";
import { supabaseBrowser } from "@/lib/supabase/client";

type ProfileForm = {
  full_name: string;
  branch: string;
  service_component: "ACTIVE" | "RESERVE" | "NATIONAL_GUARD" | "OTHER";
  mos: string;
  rank: string;
  years_service_at_eas: string;
  eas_date: string;
  terminal_leave_start: string;
  ptad_start: string;
  retirement_ceremony_date: string;
  security_clearance: string;
  career_interests: string[];
  location_pref: string;
  phone_number: string;
  professional_email: string;
  linkedin_url: string;
  location: string;
  off_duty_education: string[];
  civilian_certifications: string[];
  additional_training: string[];
};

const initialState: ProfileForm = {
  full_name: "",
  branch: "USMC",
  service_component: "ACTIVE",
  mos: "",
  rank: "",
  years_service_at_eas: "",
  eas_date: "",
  terminal_leave_start: "",
  ptad_start: "",
  retirement_ceremony_date: "",
  security_clearance: "",
  career_interests: [],
  location_pref: "",
  phone_number: "",
  professional_email: "",
  linkedin_url: "",
  location: "",
  off_duty_education: [],
  civilian_certifications: [],
  additional_training: [],
};

const BRANCHES = ["USMC", "Army", "Navy", "Air Force", "Coast Guard", "Space Force"];

type SectionId = "service" | "contact" | "goals" | "education";

function SectionCard({
  id,
  title,
  unlocks,
  done,
  savedId,
  saving,
  onSave,
  children,
}: {
  id: SectionId;
  title: string;
  unlocks: string;
  done: boolean;
  savedId: SectionId | null;
  saving: boolean;
  onSave: (id: SectionId) => void;
  children: ReactNode;
}) {
  return (
    <details className="section-card" open>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">{title}</h2>
            <p className="section-description">{unlocks}</p>
          </div>
          <span
            className={`tool-badge ${done ? "tool-badge-success" : "tool-badge-warn"}`}
            style={{ fontSize: "0.65rem" }}
          >
            {done ? "Complete" : "Add when ready"}
          </span>
        </div>
      </summary>
      <div className="mt-5 grid gap-4 md:grid-cols-2">{children}</div>
      <div className="mt-5 flex items-center gap-3">
        <button className="btn btn-primary text-sm" type="button" disabled={saving} onClick={() => onSave(id)}>
          {saving ? "Saving…" : "Save"}
        </button>
        {savedId === id && (
          <span className="text-sm font-semibold text-[var(--accent)]" role="status">
            ✓ Saved
          </span>
        )}
      </div>
    </details>
  );
}

export default function ProfilePage() {
  const [form, setForm] = useState<ProfileForm>(initialState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState<SectionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordStatusKind, setPasswordStatusKind] = useState<"success" | "error" | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) return;
        const data = await res.json();
        if (!data.profile) return;
        const p = data.profile;
        setForm({
          full_name: p.full_name ?? "",
          branch: p.branch ?? "USMC",
          service_component: p.service_component ?? "ACTIVE",
          mos: p.mos ?? "",
          rank: p.rank ?? "",
          years_service_at_eas:
            p.years_service_at_eas === null || p.years_service_at_eas === undefined
              ? ""
              : String(p.years_service_at_eas),
          eas_date: p.eas_date ?? p.separation_date ?? "",
          terminal_leave_start: p.terminal_leave_start ?? "",
          ptad_start: p.ptad_start ?? "",
          retirement_ceremony_date: p.retirement_ceremony_date ?? "",
          security_clearance: p.security_clearance ?? "",
          career_interests: p.career_interests ?? [],
          location_pref: p.location_pref ?? "",
          phone_number: p.phone_number ?? "",
          professional_email: p.professional_email ?? "",
          linkedin_url: p.linkedin_url ?? "",
          location: p.location ?? "",
          off_duty_education: p.off_duty_education ?? [],
          civilian_certifications: p.civilian_certifications ?? [],
          additional_training: p.additional_training ?? [],
        });
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function saveSection(sectionId: SectionId) {
    setSaving(true);
    setError(null);
    if (savedTimer.current) clearTimeout(savedTimer.current);

    const payload = {
      full_name: form.full_name || null,
      branch: form.branch || "USMC",
      service_component: form.service_component || null,
      mos: form.mos || null,
      rank: form.rank || null,
      years_service_at_eas: form.years_service_at_eas ? Number(form.years_service_at_eas) : null,
      eas_date: form.eas_date || null,
      terminal_leave_start: form.terminal_leave_start || null,
      ptad_start: form.ptad_start || null,
      retirement_ceremony_date: form.retirement_ceremony_date || null,
      security_clearance: form.security_clearance || null,
      career_interests: form.career_interests,
      location_pref: form.location_pref || null,
      phone_number: form.phone_number || null,
      professional_email: form.professional_email || null,
      linkedin_url: form.linkedin_url || null,
      location: form.location || null,
      off_duty_education: form.off_duty_education,
      civilian_certifications: form.civilian_certifications,
      additional_training: form.additional_training,
    };

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "That didn't save. Check the fields and try again.");
        return;
      }
      setSavedSection(sectionId);
      savedTimer.current = setTimeout(() => setSavedSection(null), 3000);
    } catch {
      setError("That didn't go through. Check your connection and try again — nothing you typed is lost.");
    } finally {
      setSaving(false);
    }
  }

  async function updatePassword(e: FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordStatus(null);
    setPasswordStatusKind(null);

    if (password.length < 8) {
      setPasswordStatus("Password must be at least 8 characters.");
      setPasswordStatusKind("error");
      setSavingPassword(false);
      return;
    }
    if (password !== confirmPassword) {
      setPasswordStatus("Password and confirm password must match.");
      setPasswordStatusKind("error");
      setSavingPassword(false);
      return;
    }

    try {
      const supabase = supabaseBrowser();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setPasswordStatus(updateError.message);
        setPasswordStatusKind("error");
        return;
      }
      setPassword("");
      setConfirmPassword("");
      setPasswordStatus("Password updated. You can now sign in with password or magic link.");
      setPasswordStatusKind("success");
    } catch (err) {
      setPasswordStatus(err instanceof Error ? err.message : "Unable to update password.");
      setPasswordStatusKind("error");
    } finally {
      setSavingPassword(false);
    }
  }

  // Section completion — drives the meter and the per-section badges
  const serviceDone = !!(form.branch && form.mos && form.rank && form.eas_date);
  const contactDone = !!(form.full_name && form.professional_email);
  const goalsDone = form.career_interests.length > 0;
  const educationDone =
    form.off_duty_education.length > 0 ||
    form.civilian_certifications.length > 0 ||
    form.additional_training.length > 0;
  const sectionsDone = [serviceDone, contactDone, goalsDone, educationDone].filter(Boolean).length;

  const meterSegments = [
    { label: "Service", done: serviceDone },
    { label: "Contact", done: contactDone },
    { label: "Goals", done: goalsDone },
    { label: "Education", done: educationDone },
  ];

  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">PROFILE</p>
            <h1 className="page-title">Tell us once — every tool uses it.</h1>
            <p className="page-description">
              Your contact info lands on your resumes, your dates drive your timeline, and your education shows up where it helps. Fill in what you know; skip what you don&apos;t.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">PROFILE STRENGTH</p>
            <p className="mt-3 text-4xl font-extrabold leading-tight text-[var(--accent)]">
              {sectionsDone}<span className="text-xl text-[var(--muted)]">/4</span>
            </p>
            <div className="mt-3 flex gap-1.5" aria-hidden="true">
              {meterSegments.map((seg) => (
                <span
                  key={seg.label}
                  className={`h-1.5 flex-1 rounded-full ${seg.done ? "bg-[var(--accent)]" : "bg-[var(--line)]"}`}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {sectionsDone === 4
                ? "Full strength — every tool has what it needs."
                : "Each section you fill in makes your results stronger."}
            </p>
          </aside>
        </div>
      </section>

      <section className="rounded-md border border-[var(--line)] bg-[var(--accent-soft)] p-4">
        <p className="text-sm font-semibold text-[var(--accent)]">Private to you</p>
        <p className="mt-1 text-sm text-[var(--foreground)]">
          Nothing here is shared publicly or sold. It&apos;s used only to make your resumes, timeline, and tool results better.
        </p>
      </section>

      {error ? <div className="alert-base alert-error">{error}</div> : null}
      {loading ? <p className="text-sm text-[var(--muted)]">Loading your profile…</p> : null}

      {/* ── Service ─────────────────────────────────────────────── */}
      <SectionCard
        id="service"
        title="Your Service"
        unlocks="Drives your EAS countdown, your timeline plan, and how the tools translate your experience."
        done={serviceDone}
        savedId={savedSection}
        saving={saving}
        onSave={(id) => void saveSection(id)}
      >
        <label className="space-y-1">
          <span className="text-sm font-medium">Branch</span>
          <select
            className="input"
            value={form.branch}
            onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
          >
            {(BRANCHES.includes(form.branch) ? BRANCHES : [form.branch, ...BRANCHES]).map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Component</span>
          <select
            className="input"
            value={form.service_component}
            onChange={(e) =>
              setForm((f) => ({ ...f, service_component: e.target.value as ProfileForm["service_component"] }))
            }
          >
            <option value="ACTIVE">Active</option>
            <option value="RESERVE">Reserve</option>
            <option value="NATIONAL_GUARD">National Guard</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Rank</span>
          <input
            className="input"
            value={form.rank}
            onChange={(e) => setForm((f) => ({ ...f, rank: e.target.value }))}
            placeholder="e.g. Sgt, SSgt, Capt"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">MOS / rate / AFSC</span>
          <input
            className="input"
            value={form.mos}
            onChange={(e) => setForm((f) => ({ ...f, mos: e.target.value }))}
            placeholder="e.g. 0311, 3531, 25B"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">EAS / retirement date</span>
          <input
            className="input"
            type="date"
            value={form.eas_date}
            onChange={(e) => setForm((f) => ({ ...f, eas_date: e.target.value }))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Years of service at EAS <span className="font-normal text-[var(--muted)]">(optional)</span></span>
          <input
            className="input"
            type="number"
            min="0"
            max="50"
            step="0.5"
            value={form.years_service_at_eas}
            onChange={(e) => setForm((f) => ({ ...f, years_service_at_eas: e.target.value }))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Security clearance <span className="font-normal text-[var(--muted)]">(optional)</span></span>
          <input
            className="input"
            value={form.security_clearance}
            onChange={(e) => setForm((f) => ({ ...f, security_clearance: e.target.value }))}
            placeholder="e.g. Secret, TS/SCI"
          />
        </label>
        <details className="md:col-span-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <summary className="cursor-pointer text-sm font-semibold">More dates — terminal leave, PTAD, ceremony (optional)</summary>
          <p className="mt-2 text-sm text-[var(--muted)]">These sharpen your timeline as your plan firms up. Add them whenever you know them.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-sm font-medium">Terminal leave starts</span>
              <input
                className="input"
                type="date"
                value={form.terminal_leave_start}
                onChange={(e) => setForm((f) => ({ ...f, terminal_leave_start: e.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">PTAD starts</span>
              <input
                className="input"
                type="date"
                value={form.ptad_start}
                onChange={(e) => setForm((f) => ({ ...f, ptad_start: e.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Retirement ceremony</span>
              <input
                className="input"
                type="date"
                value={form.retirement_ceremony_date}
                onChange={(e) => setForm((f) => ({ ...f, retirement_ceremony_date: e.target.value }))}
              />
            </label>
          </div>
        </details>
      </SectionCard>

      {/* ── Contact ─────────────────────────────────────────────── */}
      <SectionCard
        id="contact"
        title="Your Contact Info"
        unlocks="Goes at the top of every resume MilVector builds for you — name, email, phone, location."
        done={contactDone}
        savedId={savedSection}
        saving={saving}
        onSave={(id) => void saveSection(id)}
      >
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium">Full name</span>
          <input
            className="input"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            placeholder="As you want it to appear on your resume"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Email for employers</span>
          <input
            className="input"
            type="email"
            value={form.professional_email}
            onChange={(e) => setForm((f) => ({ ...f, professional_email: e.target.value }))}
            placeholder="A civilian address you check often"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Phone</span>
          <input
            className="input"
            value={form.phone_number}
            onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Where you live now</span>
          <input
            className="input"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="City, State"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">LinkedIn URL <span className="font-normal text-[var(--muted)]">(optional)</span></span>
          <input
            className="input"
            value={form.linkedin_url}
            onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
            placeholder="linkedin.com/in/yourname"
          />
          <p className="text-xs text-[var(--muted)]">
            This link is just saved to your profile. For the tools to actually read your LinkedIn content, export your profile to PDF and upload it in{" "}
            <a href="/app/documents" className="underline">Documents</a>.
          </p>
        </label>
      </SectionCard>

      {/* ── Goals ───────────────────────────────────────────────── */}
      <SectionCard
        id="goals"
        title="Your Goals"
        unlocks="Aims the job matching and resume tools at the work you actually want, where you want it."
        done={goalsDone}
        savedId={savedSection}
        saving={saving}
        onSave={(id) => void saveSection(id)}
      >
        <div className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium">Career interests</span>
          <ChipInput
            value={form.career_interests}
            onChange={(next) => setForm((f) => ({ ...f, career_interests: next }))}
            placeholder="e.g. Project Management"
          />
        </div>
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium">Where do you want to work?</span>
          <input
            className="input"
            value={form.location_pref}
            onChange={(e) => setForm((f) => ({ ...f, location_pref: e.target.value }))}
            placeholder="e.g. Dallas–Fort Worth, remote, or open to anywhere"
          />
        </label>
      </SectionCard>

      {/* ── Education & Certifications ──────────────────────────── */}
      <SectionCard
        id="education"
        title="Your Education & Certifications"
        unlocks="Gets your degrees, certs, and training onto your resumes and LinkedIn profile automatically."
        done={educationDone}
        savedId={savedSection}
        saving={saving}
        onSave={(id) => void saveSection(id)}
      >
        <div className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium">Degrees & off-duty education</span>
          <ChipInput
            value={form.off_duty_education}
            onChange={(next) => setForm((f) => ({ ...f, off_duty_education: next }))}
            placeholder="e.g. B.S. Business Administration, UNC (2025)"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium">Civilian certifications</span>
          <ChipInput
            value={form.civilian_certifications}
            onChange={(next) => setForm((f) => ({ ...f, civilian_certifications: next }))}
            placeholder="e.g. PMP"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium">Other training</span>
          <ChipInput
            value={form.additional_training}
            onChange={(next) => setForm((f) => ({ ...f, additional_training: next }))}
            placeholder="e.g. Google Project Management Certificate"
          />
        </div>
      </SectionCard>

      {/* ── Account security ────────────────────────────────────── */}
      <section className="section-card">
        <h2 className="section-title">Account Security</h2>
        <p className="section-description">
          Add or change a password if you started with magic links and want another way in.
        </p>
        <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={updatePassword}>
          <label className="space-y-1">
            <span className="text-sm font-medium">New password</span>
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Confirm password</span>
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              minLength={8}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)] md:col-span-2">
            <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
            Show password
          </label>
          <div className="md:col-span-2">
            <button className="btn btn-primary w-full sm:w-auto" disabled={savingPassword} type="submit">
              {savingPassword ? "Updating…" : "Update Password"}
            </button>
          </div>
        </form>
        {passwordStatus ? (
          <div className={`alert-base mt-4 ${passwordStatusKind === "error" ? "alert-error" : "alert-success"}`}>
            {passwordStatus}
          </div>
        ) : null}
      </section>
    </main>
  );
}
