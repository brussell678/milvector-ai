"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Artifact = {
  id: string;
  title: string;
  artifact_type: string;
  created_at: string;
};

type MasterResumeDocument = {
  id: string;
  doc_type: "MASTER_RESUME";
  filename: string;
  created_at: string;
  text_extracted: boolean;
};

type MasterResumeOption = {
  value: string;
  label: string;
  sourceType: "artifact" | "document";
  id: string;
};

type ResumeAnalysisOutput = {
  strengths: string[];
  functional_areas: string[];
  leadership_scope: string[];
  role_families: string[];
  skills: string[];
  civilian_translation_notes: string[];
  positioning_summary: string;
};

type CareerSuggestionsOutput = {
  suggested_roles: Array<{
    title: string;
    why_fit: string;
    target_industries: string[];
    seniority: string;
  }>;
  suggested_industries: string[];
  recommended_seniority: string;
  positioning_advice: string[];
  location_strategy: string;
};

type LinkedinProfileOutput = {
  profileId?: string;
  headlines: string[];
  about_versions: string[];
  experience: Array<{
    title: string;
    bullets: string[];
  }>;
  skills: string[];
  networking_guidance: {
    connection_targets: string[];
    outreach_messages: string[];
    activation_plan: string[];
  };
};

type BannerOutput = {
  banner_prompt: string;
  style_notes: string[];
  visual_focus: string[];
};

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
          {items.map((item, idx) => (
            <li key={`${title}-${idx}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-[var(--muted)]">Nothing generated yet.</p>
      )}
    </section>
  );
}

export default function LinkedinBuilderPage() {
  const [masterResumeSelection, setMasterResumeSelection] = useState("");
  const [masterResumeOptions, setMasterResumeOptions] = useState<MasterResumeOption[]>([]);
  const [pastedResumeText, setPastedResumeText] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [secondaryRoles, setSecondaryRoles] = useState("");
  const [industry, setIndustry] = useState("");
  const [locationPref, setLocationPref] = useState("");
  const [tone, setTone] = useState("professional, confident, modern");
  const [analysis, setAnalysis] = useState<ResumeAnalysisOutput | null>(null);
  const [careerSuggestions, setCareerSuggestions] = useState<CareerSuggestionsOutput | null>(null);
  const [profileOutput, setProfileOutput] = useState<LinkedinProfileOutput | null>(null);
  const [bannerOutput, setBannerOutput] = useState<BannerOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [copyState, setCopyState] = useState("");

  useEffect(() => {
    async function loadSources() {
      try {
        const [artifactRes, docsRes] = await Promise.all([
          fetch("/api/resume-artifacts?type=master_resume"),
          fetch("/api/documents"),
        ]);
        const artifactData = await artifactRes.json().catch(() => ({}));
        const docsData = await docsRes.json().catch(() => ({}));
        const nextOptions: MasterResumeOption[] = [];

        if (artifactRes.ok) {
          const rows = (artifactData.artifacts ?? []) as Artifact[];
          nextOptions.push(
            ...rows.map((artifact) => ({
              value: `artifact:${artifact.id}`,
              id: artifact.id,
              sourceType: "artifact" as const,
              label: `${artifact.title} (${new Date(artifact.created_at).toLocaleDateString()}) - Saved master resume`,
            }))
          );
        }

        if (docsRes.ok) {
          const docs = (docsData.documents ?? []) as MasterResumeDocument[];
          const masterDocs = docs.filter((d) => d.doc_type === "MASTER_RESUME");
          nextOptions.push(
            ...masterDocs.map((doc) => ({
              value: `document:${doc.id}`,
              id: doc.id,
              sourceType: "document" as const,
              label: `${doc.filename} (${new Date(doc.created_at).toLocaleDateString()})${doc.text_extracted ? "" : " - not extracted"} - Uploaded master resume`,
            }))
          );
        }

        setMasterResumeOptions(nextOptions);
        if (nextOptions.length > 0) {
          setMasterResumeSelection((current) => current || nextOptions[0].value);
        }
      } catch {
        // Manual paste remains available.
      }
    }

    void loadSources();
  }, []);

  const selectedMasterResume = useMemo(
    () => masterResumeOptions.find((option) => option.value === masterResumeSelection) ?? null,
    [masterResumeOptions, masterResumeSelection]
  );

  function buildSourcePayload() {
    return {
      masterResumeArtifactId: selectedMasterResume?.sourceType === "artifact" ? selectedMasterResume.id : undefined,
      masterResumeDocumentId: selectedMasterResume?.sourceType === "document" ? selectedMasterResume.id : undefined,
      pastedResumeText: pastedResumeText || undefined,
    };
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(`${label} copied`);
      window.setTimeout(() => setCopyState(""), 1500);
    } catch {
      setCopyState(`Could not copy ${label.toLowerCase()}`);
      window.setTimeout(() => setCopyState(""), 1500);
    }
  }

  async function runResumeAnalysis(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setActiveTask("Running Step 1: Resume Analysis...");
    setError(null);
    setNotice(null);
    setAnalysis(null);
    setCareerSuggestions(null);
    setProfileOutput(null);
    setBannerOutput(null);

    try {
      const res = await fetch("/api/tools/linkedin-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowStage: "resume_analysis",
          ...buildSourcePayload(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Resume analysis failed.");
        return;
      }

      setAnalysis(data as ResumeAnalysisOutput);
      setNotice("Resume analysis complete. Review the positioning summary and then generate career suggestions.");
    } catch {
      setError("Network error during resume analysis.");
    } finally {
      setLoading(false);
      setActiveTask(null);
    }
  }

  async function runCareerSuggestions() {
    setLoading(true);
    setActiveTask("Running Step 2: Career Suggestions...");
    setError(null);
    setNotice(null);
    setCareerSuggestions(null);
    setProfileOutput(null);
    setBannerOutput(null);

    try {
      const res = await fetch("/api/tools/linkedin-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowStage: "career_suggestions",
          ...buildSourcePayload(),
          analysisContext: analysis ?? undefined,
          locationPref: locationPref || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Career suggestions failed.");
        return;
      }

      const output = data as CareerSuggestionsOutput;
      setCareerSuggestions(output);
      if (!targetRole && output.suggested_roles.length > 0) setTargetRole(output.suggested_roles[0].title);
      if (!industry && output.suggested_industries.length > 0) setIndustry(output.suggested_industries[0]);
      setNotice("Career suggestions ready. Select your target role and industry before generating the profile.");
    } catch {
      setError("Network error during career suggestions.");
    } finally {
      setLoading(false);
      setActiveTask(null);
    }
  }

  async function runProfileGeneration() {
    setLoading(true);
    setActiveTask("Running Step 3: LinkedIn Profile Generation...");
    setError(null);
    setNotice(null);
    setProfileOutput(null);
    setBannerOutput(null);

    try {
      const res = await fetch("/api/tools/linkedin-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowStage: "generate_profile",
          ...buildSourcePayload(),
          analysisContext: {
            analysis,
            careerSuggestions,
          },
          targetRole,
          secondaryRoles: secondaryRoles
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          industry,
          locationPref: locationPref || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "LinkedIn profile generation failed.");
        return;
      }

      setProfileOutput(data as LinkedinProfileOutput);
      setNotice("LinkedIn profile package generated and saved to your account context.");
    } catch {
      setError("Network error during profile generation.");
    } finally {
      setLoading(false);
      setActiveTask(null);
    }
  }

  async function runBannerPrompt() {
    setLoading(true);
    setActiveTask("Running Step 4: Banner Prompt Generation...");
    setError(null);
    setNotice(null);
    setBannerOutput(null);

    try {
      const res = await fetch("/api/tools/linkedin-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowStage: "banner_prompt",
          targetRole,
          industry,
          tone,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Banner prompt generation failed.");
        return;
      }

      setBannerOutput(data as BannerOutput);
      setNotice("Banner prompt ready to copy into an image-generation workflow later.");
    } catch {
      setError("Network error during banner prompt generation.");
    } finally {
      setLoading(false);
      setActiveTask(null);
    }
  }

  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">LINKEDIN PROFILE BUILDER</p>
            <h1 className="page-title">Build a stronger LinkedIn presence from your master resume.</h1>
            <p className="page-description">
              Move from resume evidence to career targeting, LinkedIn copy, networking guidance, and banner-prompt direction without losing continuity across MilVector.
            </p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">PHASE 1 OUTPUTS</p>
            <ul className="page-hero-list">
              <li>Resume analysis and positioning summary</li>
              <li>Career-path suggestions and role targeting</li>
              <li>LinkedIn headlines, About sections, experience, and skills</li>
              <li>Networking guidance and banner prompt output</li>
            </ul>
          </aside>
        </div>
      </section>

      {loading && (
        <section className="section-card border-[var(--accent)]">
          <p className="text-sm font-semibold text-[var(--accent)]">{activeTask ?? "Running request..."}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">AI processing is in progress. Please wait for the current step to finish.</p>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="space-y-4">
          <section className="section-card space-y-4">
            <div>
              <p className="section-title">Step 1: Resume Input</p>
              <p className="section-description">
                Start with a saved master resume, uploaded master-resume document, or pasted resume text so the builder can analyze real evidence before generating LinkedIn positioning.
              </p>
            </div>

            <form className="space-y-4" onSubmit={runResumeAnalysis}>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Saved Master Resume</span>
                <select className="input" value={masterResumeSelection} onChange={(e) => setMasterResumeSelection(e.target.value)}>
                  <option value="">Select a master resume</option>
                  {masterResumeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-sm font-medium">Pasted Resume Text (optional if source selected)</span>
                <textarea
                  className="input min-h-40"
                  value={pastedResumeText}
                  onChange={(e) => setPastedResumeText(e.target.value)}
                  placeholder="Paste your master resume text here if you do not want to use a saved source."
                />
              </label>

              <button className="btn btn-primary" type="submit" disabled={loading}>
                Run Step 1
              </button>
            </form>
          </section>

          <section className="section-card space-y-4">
            <div>
              <p className="section-title">Step 2: Career Targeting</p>
              <p className="section-description">
                Use resume analysis to suggest realistic role paths before you commit to LinkedIn copy.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Target Role</span>
                <input className="input" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="Program Manager" />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Industry</span>
                <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Defense Tech" />
              </label>
              <label className="block space-y-1 md:col-span-2">
                <span className="text-sm font-medium">Secondary Roles (comma-separated)</span>
                <input className="input" value={secondaryRoles} onChange={(e) => setSecondaryRoles(e.target.value)} placeholder="Operations Manager, Project Manager" />
              </label>
              <label className="block space-y-1 md:col-span-2">
                <span className="text-sm font-medium">Location Strategy / Preference</span>
                <input className="input" value={locationPref} onChange={(e) => setLocationPref(e.target.value)} placeholder="Remote-friendly, East Coast, DC area" />
              </label>
            </div>

            <button className="btn btn-primary" type="button" onClick={runCareerSuggestions} disabled={loading}>
              Run Step 2
            </button>
          </section>

          <section className="section-card space-y-4">
            <div>
              <p className="section-title">Step 3: Profile Generation</p>
              <p className="section-description">
                Generate LinkedIn headlines, About options, experience bullets, skills, and networking guidance from the selected target direction.
              </p>
            </div>
            <button className="btn btn-primary" type="button" onClick={runProfileGeneration} disabled={loading}>
              Generate LinkedIn Profile Package
            </button>
          </section>

          <section className="section-card space-y-4">
            <div>
              <p className="section-title">Step 4: Banner Prompt</p>
              <p className="section-description">
                Generate a copyable LinkedIn banner prompt aligned to your role, industry, and tone.
              </p>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Tone</span>
              <input className="input" value={tone} onChange={(e) => setTone(e.target.value)} />
            </label>
            <button className="btn btn-primary" type="button" onClick={runBannerPrompt} disabled={loading}>
              Generate Banner Prompt
            </button>
          </section>
        </section>

        <section className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          {(error || notice || copyState) && (
            <section className="section-card">
              {error && <p className="text-sm text-red-700">{error}</p>}
              {notice && <p className="text-sm text-[var(--accent)]">{notice}</p>}
              {copyState && <p className="text-sm text-[var(--accent)]">{copyState}</p>}
            </section>
          )}

          {analysis && (
            <section className="section-card space-y-4">
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Positioning summary", analysis.positioning_summary)}>
                  Copy Summary
                </button>
              </div>
              <p className="section-title">Resume Analysis</p>
              <p className="text-sm text-[var(--muted)]">{analysis.positioning_summary}</p>
              <ListBlock title="Strengths" items={analysis.strengths} />
              <ListBlock title="Functional Areas" items={analysis.functional_areas} />
              <ListBlock title="Leadership Scope" items={analysis.leadership_scope} />
              <ListBlock title="Role Families" items={analysis.role_families} />
              <ListBlock title="Skills" items={analysis.skills} />
            </section>
          )}

          {careerSuggestions && (
            <section className="section-card space-y-4">
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-secondary text-sm"
                  type="button"
                  onClick={() =>
                    void copyText(
                      "Career suggestions",
                      careerSuggestions.suggested_roles.map((role) => `${role.title}: ${role.why_fit}`).join("\n")
                    )
                  }
                >
                  Copy Career Matches
                </button>
              </div>
              <p className="section-title">Career Suggestions</p>
              <p className="text-sm text-[var(--muted)]">
                Recommended seniority: {careerSuggestions.recommended_seniority || "Not specified"}
              </p>
              {careerSuggestions.location_strategy ? (
                <p className="text-sm text-[var(--muted)]">{careerSuggestions.location_strategy}</p>
              ) : null}
              <div className="space-y-3">
                {careerSuggestions.suggested_roles.map((role) => (
                  <article key={role.title} className="subtle-panel p-4">
                    <p className="font-semibold">{role.title}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{role.why_fit}</p>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Industries: {role.target_industries.join(", ")} | Seniority: {role.seniority}
                    </p>
                  </article>
                ))}
              </div>
              <ListBlock title="Positioning Advice" items={careerSuggestions.positioning_advice} />
            </section>
          )}

          {profileOutput && (
            <section className="section-card space-y-4">
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Headlines", profileOutput.headlines.join("\n"))}>
                  Copy Headlines
                </button>
                <button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Skills", profileOutput.skills.join(", "))}>
                  Copy Skills
                </button>
              </div>
              <p className="section-title">Generated LinkedIn Profile</p>
              {profileOutput.profileId ? (
                <p className="text-xs text-[var(--muted)]">Saved profile ID: {profileOutput.profileId}</p>
              ) : null}
              <ListBlock title="Headline Options" items={profileOutput.headlines} />
              <section>
                <h3 className="text-sm font-semibold">About Versions</h3>
                <div className="mt-2 space-y-3">
                  {profileOutput.about_versions.map((about, idx) => (
                    <article key={`about-${idx}`} className="subtle-panel p-4">
                      <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{about}</p>
                      <button className="btn btn-secondary mt-3 text-sm" type="button" onClick={() => void copyText(`About version ${idx + 1}`, about)}>
                        Copy
                      </button>
                    </article>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="text-sm font-semibold">Experience</h3>
                <div className="mt-2 space-y-3">
                  {profileOutput.experience.map((entry) => (
                    <article key={entry.title} className="subtle-panel p-4">
                      <p className="font-semibold">{entry.title}</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                        {entry.bullets.map((bullet, idx) => (
                          <li key={`${entry.title}-${idx}`}>{bullet}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
              <ListBlock title="Prioritized Skills" items={profileOutput.skills} />
              <ListBlock title="Connection Targets" items={profileOutput.networking_guidance.connection_targets} />
              <ListBlock title="Outreach Messages" items={profileOutput.networking_guidance.outreach_messages} />
              <ListBlock title="Activation Plan" items={profileOutput.networking_guidance.activation_plan} />
            </section>
          )}

          {bannerOutput && (
            <section className="section-card space-y-4">
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Banner prompt", bannerOutput.banner_prompt)}>
                  Copy Banner Prompt
                </button>
              </div>
              <p className="section-title">Banner Prompt</p>
              <pre className="whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{bannerOutput.banner_prompt}</pre>
              <ListBlock title="Style Notes" items={bannerOutput.style_notes} />
              <ListBlock title="Visual Focus" items={bannerOutput.visual_focus} />
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
