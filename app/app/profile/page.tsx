"use client";

import { FormEvent, useEffect, useState } from "react";

type Profile = {
  branch: string;
  service_component: "ACTIVE" | "RESERVE" | "NATIONAL_GUARD" | "OTHER";
  mos: string;
  rank: string;
  years_service_at_eas: string;
  eas_date: string;
  career_interests: string;
  location_pref: string;
  phone_number: string;
  professional_email: string;
  linkedin_url: string;
  location: string;
  security_clearance: string;
  off_duty_education: string;
  civilian_certifications: string;
  additional_training: string;
};

const initialState: Profile = {
  branch: "USMC",
  service_component: "ACTIVE",
  mos: "",
  rank: "",
  years_service_at_eas: "",
  eas_date: "",
  career_interests: "",
  location_pref: "",
  phone_number: "",
  professional_email: "",
  linkedin_url: "",
  location: "",
  security_clearance: "",
  off_duty_education: "",
  civilian_certifications: "",
  additional_training: "",
};

function parseListInput(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function ProfilePage() {
  const [form, setForm] = useState<Profile>(initialState);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/profile");
      if (!res.ok) return;
      const data = await res.json();
      if (!data.profile) return;
      setForm({
        branch: data.profile.branch ?? "USMC",
        service_component: data.profile.service_component ?? "ACTIVE",
        mos: data.profile.mos ?? "",
        rank: data.profile.rank ?? "",
        years_service_at_eas:
          data.profile.years_service_at_eas === null || data.profile.years_service_at_eas === undefined
            ? ""
            : String(data.profile.years_service_at_eas),
        eas_date: data.profile.eas_date ?? data.profile.separation_date ?? "",
        career_interests: (data.profile.career_interests ?? []).join(", "),
        location_pref: data.profile.location_pref ?? "",
        phone_number: data.profile.phone_number ?? "",
        professional_email: data.profile.professional_email ?? "",
        linkedin_url: data.profile.linkedin_url ?? "",
        location: data.profile.location ?? "",
        security_clearance: data.profile.security_clearance ?? "",
        off_duty_education: (data.profile.off_duty_education ?? []).join("\n"),
        civilian_certifications: (data.profile.civilian_certifications ?? []).join("\n"),
        additional_training: (data.profile.additional_training ?? []).join("\n"),
      });
    }
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);

    const payload = {
      branch: form.branch,
      service_component: form.service_component || null,
      mos: form.mos || null,
      rank: form.rank || null,
      years_service_at_eas: form.years_service_at_eas ? Number(form.years_service_at_eas) : null,
      eas_date: form.eas_date || null,
      career_interests: form.career_interests
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      location_pref: form.location_pref || null,
      phone_number: form.phone_number || null,
      professional_email: form.professional_email || null,
      linkedin_url: form.linkedin_url || null,
      location: form.location || null,
      security_clearance: form.security_clearance || null,
      off_duty_education: parseListInput(form.off_duty_education),
      civilian_certifications: parseListInput(form.civilian_certifications),
      additional_training: parseListInput(form.additional_training),
    };

    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to save profile" }));
      setStatus(err.error ?? "Failed to save profile");
      return;
    }
    setStatus("Profile saved.");
  }

  return (
    <main className="panel p-6">
      <h1 className="text-2xl font-bold">Profile</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Your profile is used to improve context quality for tool outputs and mission timeline planning.
      </p>
      <section className="mt-4 rounded-md border border-[var(--line)] bg-[var(--accent-soft)] p-4">
        <p className="text-sm font-semibold text-[var(--accent)]">Privacy Notice</p>
        <p className="mt-1 text-sm text-[var(--foreground)]">
          Your profile information is stored securely in your account and is not shared publicly. We use it only to
          personalize and improve the accuracy of your MilVector AI outputs.
        </p>
      </section>

      <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
        <label className="space-y-1">
          <span className="text-sm font-medium">Branch</span>
          <input
            className="input"
            value={form.branch}
            onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
            required
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">MOS</span>
          <input
            className="input"
            value={form.mos}
            onChange={(e) => setForm((f) => ({ ...f, mos: e.target.value }))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Service Component</span>
          <select
            className="input"
            value={form.service_component}
            onChange={(e) =>
              setForm((f) => ({ ...f, service_component: e.target.value as Profile["service_component"] }))
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
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Years of Service at EAS (optional)</span>
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
          <span className="text-sm font-medium">EAS Date</span>
          <input
            className="input"
            type="date"
            value={form.eas_date}
            onChange={(e) => setForm((f) => ({ ...f, eas_date: e.target.value }))}
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium">Career Interests (comma-separated)</span>
          <input
            className="input"
            value={form.career_interests}
            onChange={(e) => setForm((f) => ({ ...f, career_interests: e.target.value }))}
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium">Location Preference</span>
          <input
            className="input"
            value={form.location_pref}
            onChange={(e) => setForm((f) => ({ ...f, location_pref: e.target.value }))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Professional Email</span>
          <input
            className="input"
            type="email"
            value={form.professional_email}
            onChange={(e) => setForm((f) => ({ ...f, professional_email: e.target.value }))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Phone Number</span>
          <input
            className="input"
            value={form.phone_number}
            onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium">LinkedIn URL</span>
          <input
            className="input"
            value={form.linkedin_url}
            onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Location</span>
          <input
            className="input"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Security Clearance</span>
          <input
            className="input"
            value={form.security_clearance}
            onChange={(e) => setForm((f) => ({ ...f, security_clearance: e.target.value }))}
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium">Off-Duty Education (one per line)</span>
          <textarea
            className="input min-h-28"
            value={form.off_duty_education}
            onChange={(e) => setForm((f) => ({ ...f, off_duty_education: e.target.value }))}
            placeholder="B.S. Business Administration, UNC (2025)"
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium">Civilian Certifications (one per line)</span>
          <textarea
            className="input min-h-28"
            value={form.civilian_certifications}
            onChange={(e) => setForm((f) => ({ ...f, civilian_certifications: e.target.value }))}
            placeholder="PMP, Lean Six Sigma Green Belt, CompTIA Security+"
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-sm font-medium">Additional Training (one per line)</span>
          <textarea
            className="input min-h-28"
            value={form.additional_training}
            onChange={(e) => setForm((f) => ({ ...f, additional_training: e.target.value }))}
            placeholder="Google Project Management Certificate"
          />
        </label>
        <div className="md:col-span-2">
          <button className="btn btn-primary" disabled={saving} type="submit">
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </form>

      {status && <p className="mt-4 text-sm text-[var(--accent)]">{status}</p>}
    </main>
  );
}
