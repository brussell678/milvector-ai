"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Artifact = { id: string; title: string; created_at: string };
type MasterResumeDocument = { id: string; doc_type: "MASTER_RESUME"; filename: string; created_at: string; text_extracted: boolean };
type MasterResumeOption = { value: string; label: string; sourceType: "artifact" | "document"; id: string };
type ResumeAnalysisOutput = { strengths: string[]; functional_areas: string[]; leadership_scope: string[]; role_families: string[]; skills: string[]; civilian_translation_notes: string[]; positioning_summary: string };
type CareerSuggestionsOutput = { suggested_roles: Array<{ title: string; why_fit: string; target_industries: string[]; seniority: string }>; suggested_industries: string[]; recommended_seniority: string; positioning_advice: string[]; location_strategy: string };
type LinkedinProfileOutput = { profileId?: string; headlines: string[]; about_versions: string[]; experience: Array<{ title: string; bullets: string[] }>; skills: string[]; networking_guidance: { connection_targets: string[]; outreach_messages: string[]; activation_plan: string[] } };
type BannerOutput = { banner_prompt: string; style_notes: string[]; visual_focus: string[] };
type ProfileScoreOutput = { overall_score: number; recruiter_readiness: string; strengths: string[]; improvement_priorities: string[]; section_scores: Array<{ section: string; score: number; max_score: number; rationale: string; actions: string[] }> };
type SavedLinkedinProfile = { id: string; versionLabel: string | null; resumeText: string; targetRole: string | null; industry: string | null; industryTuning: string | null; locationPref: string | null; analysisContext: { analysis?: ResumeAnalysisOutput; careerSuggestions?: CareerSuggestionsOutput }; careerSuggestions: CareerSuggestionsOutput | Record<string, never>; generatedProfile: LinkedinProfileOutput | Record<string, never>; profileScore: ProfileScoreOutput | Record<string, never>; bannerOutput: BannerOutput | Record<string, never>; bannerImageUrl: string | null; createdAt: string };

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return items.length ? (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">{items.map((item, idx) => <li key={`${title}-${idx}`}>{item}</li>)}</ul>
    </section>
  ) : null;
}

function hasData(value: unknown) {
  return !!value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length > 0;
}

export default function LinkedinBuilderPage() {
  const [masterResumeSelection, setMasterResumeSelection] = useState("");
  const [masterResumeOptions, setMasterResumeOptions] = useState<MasterResumeOption[]>([]);
  const [savedProfiles, setSavedProfiles] = useState<SavedLinkedinProfile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState("");
  const [masterResumeText, setMasterResumeText] = useState("");
  const [pastedResumeText, setPastedResumeText] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [secondaryRoles, setSecondaryRoles] = useState("");
  const [industry, setIndustry] = useState("");
  const [industryTuning, setIndustryTuning] = useState("General civilian hiring");
  const [locationPref, setLocationPref] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [tone, setTone] = useState("professional, confident, modern");
  const [analysis, setAnalysis] = useState<ResumeAnalysisOutput | null>(null);
  const [careerSuggestions, setCareerSuggestions] = useState<CareerSuggestionsOutput | null>(null);
  const [profileOutput, setProfileOutput] = useState<LinkedinProfileOutput | null>(null);
  const [profileScore, setProfileScore] = useState<ProfileScoreOutput | null>(null);
  const [bannerOutput, setBannerOutput] = useState<BannerOutput | null>(null);
  const [bannerImageUrl, setBannerImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [copyState, setCopyState] = useState("");

  useEffect(() => {
    async function loadSources() {
      const [artifactRes, docsRes, savedRes] = await Promise.all([fetch("/api/resume-artifacts?type=master_resume"), fetch("/api/documents"), fetch("/api/tools/linkedin-builder")]);
      const artifactData = await artifactRes.json().catch(() => ({}));
      const docsData = await docsRes.json().catch(() => ({}));
      const savedData = await savedRes.json().catch(() => ({}));
      const nextOptions: MasterResumeOption[] = [];
      if (artifactRes.ok) nextOptions.push(...((artifactData.artifacts ?? []) as Artifact[]).map((artifact) => ({ value: `artifact:${artifact.id}`, id: artifact.id, sourceType: "artifact" as const, label: `${artifact.title} (${new Date(artifact.created_at).toLocaleDateString()}) - Saved master resume` })));
      if (docsRes.ok) nextOptions.push(...((docsData.documents ?? []) as MasterResumeDocument[]).filter((d) => d.doc_type === "MASTER_RESUME").map((doc) => ({ value: `document:${doc.id}`, id: doc.id, sourceType: "document" as const, label: `${doc.filename} (${new Date(doc.created_at).toLocaleDateString()})${doc.text_extracted ? "" : " - not extracted"} - Uploaded master resume` })));
      setMasterResumeOptions(nextOptions);
      if (nextOptions.length > 0) setMasterResumeSelection((current) => current || nextOptions[0].value);
      if (savedRes.ok) setSavedProfiles((savedData.profiles ?? []) as SavedLinkedinProfile[]);
    }
    void loadSources();
  }, []);

  const selectedMasterResume = useMemo(() => masterResumeOptions.find((option) => option.value === masterResumeSelection) ?? null, [masterResumeOptions, masterResumeSelection]);
  const buildSourcePayload = () => ({ masterResumeArtifactId: selectedMasterResume?.sourceType === "artifact" ? selectedMasterResume.id : undefined, masterResumeDocumentId: selectedMasterResume?.sourceType === "document" ? selectedMasterResume.id : undefined, pastedResumeText: pastedResumeText || masterResumeText || undefined });

  async function refreshSavedProfiles() {
    const res = await fetch("/api/tools/linkedin-builder");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSavedProfiles((data.profiles ?? []) as SavedLinkedinProfile[]);
  }

  function applySavedProfile(profile: SavedLinkedinProfile) {
    setCurrentProfileId(profile.id);
    setMasterResumeText(profile.resumeText);
    setPastedResumeText(profile.resumeText);
    setVersionLabel(profile.versionLabel ?? "");
    setTargetRole(profile.targetRole ?? "");
    setIndustry(profile.industry ?? "");
    setIndustryTuning(profile.industryTuning ?? "General civilian hiring");
    setLocationPref(profile.locationPref ?? "");
    setAnalysis(hasData(profile.analysisContext?.analysis) ? (profile.analysisContext.analysis as ResumeAnalysisOutput) : null);
    setCareerSuggestions(hasData(profile.careerSuggestions) ? (profile.careerSuggestions as CareerSuggestionsOutput) : hasData(profile.analysisContext?.careerSuggestions) ? (profile.analysisContext.careerSuggestions as CareerSuggestionsOutput) : null);
    setProfileOutput(hasData(profile.generatedProfile) ? ({ ...(profile.generatedProfile as LinkedinProfileOutput), profileId: profile.id }) : null);
    setProfileScore(hasData(profile.profileScore) ? (profile.profileScore as ProfileScoreOutput) : null);
    setBannerOutput(hasData(profile.bannerOutput) ? (profile.bannerOutput as BannerOutput) : null);
    setBannerImageUrl(profile.bannerImageUrl);
    setNotice(`Loaded saved version${profile.versionLabel ? `: ${profile.versionLabel}` : ""}.`);
    setError(null);
  }

  async function copyText(label: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopyState(`${label} copied`); } catch { setCopyState(`Could not copy ${label.toLowerCase()}`); }
    window.setTimeout(() => setCopyState(""), 1500);
  }

  async function postTool(body: Record<string, unknown>, task: string) {
    setLoading(true); setActiveTask(task); setError(null); setNotice(null);
    try {
      const res = await fetch("/api/tools/linkedin-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Request failed."); return null; }
      return data;
    } catch {
      setError("Network error during tool run."); return null;
    } finally {
      setLoading(false); setActiveTask(null);
    }
  }

  async function runResumeAnalysis(e: FormEvent) {
    e.preventDefault();
    setCurrentProfileId(""); setAnalysis(null); setCareerSuggestions(null); setProfileOutput(null); setProfileScore(null); setBannerOutput(null); setBannerImageUrl(null);
    const data = await postTool({ workflowStage: "resume_analysis", ...buildSourcePayload() }, "Running Step 1: Resume Analysis...");
    if (!data) return;
    setAnalysis(data as ResumeAnalysisOutput);
    setNotice("Resume analysis complete. Review the summary and then generate career suggestions.");
  }

  async function runCareerSuggestions() {
    setCareerSuggestions(null); setProfileOutput(null); setProfileScore(null); setBannerOutput(null); setBannerImageUrl(null);
    const data = await postTool({ workflowStage: "career_suggestions", ...buildSourcePayload(), analysisContext: analysis ?? undefined, locationPref: locationPref || undefined }, "Running Step 2: Career Suggestions...");
    if (!data) return;
    const output = data as CareerSuggestionsOutput;
    setCareerSuggestions(output);
    if (!targetRole && output.suggested_roles.length > 0) setTargetRole(output.suggested_roles[0].title);
    if (!industry && output.suggested_industries.length > 0) setIndustry(output.suggested_industries[0]);
    setNotice("Career suggestions ready. Set role, industry, and tuning before generating the profile.");
  }

  async function runProfileGeneration() {
    const data = await postTool({ workflowStage: "generate_profile", ...buildSourcePayload(), analysisContext: { analysis, careerSuggestions }, targetRole, secondaryRoles: secondaryRoles.split(",").map((item) => item.trim()).filter(Boolean), industry, industryTuning, locationPref: locationPref || undefined, versionLabel: versionLabel || undefined }, "Running Step 3: LinkedIn Profile Generation...");
    if (!data) return;
    const output = data as LinkedinProfileOutput;
    setCurrentProfileId(output.profileId ?? "");
    setProfileOutput(output); setProfileScore(null); setBannerOutput(null); setBannerImageUrl(null);
    setNotice("LinkedIn profile package generated and saved as a version.");
    void refreshSavedProfiles();
  }

  async function runProfileScoring() {
    if (!profileOutput) return;
    const data = await postTool({ workflowStage: "score_profile", profileId: currentProfileId || undefined, profileJson: profileOutput, targetRole, industry, industryTuning }, "Running Phase 2: Profile Scoring...");
    if (!data) return;
    setProfileScore(data as ProfileScoreOutput);
    setNotice("Profile score generated. Use the improvement priorities to strengthen the next version.");
    void refreshSavedProfiles();
  }

  async function runBannerPrompt() {
    const data = await postTool({ workflowStage: "banner_prompt", profileId: currentProfileId || undefined, targetRole, industry, industryTuning, tone }, "Running Step 4: Banner Prompt Generation...");
    if (!data) return;
    setBannerOutput(data as BannerOutput); setBannerImageUrl(null);
    setNotice("Banner prompt ready. You can copy it or generate a banner image directly.");
    void refreshSavedProfiles();
  }

  async function runBannerImageGeneration() {
    if (!bannerOutput?.banner_prompt) return;
    const data = await postTool({ workflowStage: "banner_image", profileId: currentProfileId || undefined, bannerPrompt: bannerOutput.banner_prompt, targetRole, industry }, "Running Phase 2: Banner Image Generation...");
    if (!data) return;
    setBannerImageUrl((data as { imageUrl?: string | null }).imageUrl ?? null);
    setNotice("Banner image generated and attached to this saved version.");
    void refreshSavedProfiles();
  }

  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">LINKEDIN PROFILE BUILDER</p>
            <h1 className="page-title">Build, score, and version a stronger LinkedIn presence from your master resume.</h1>
            <p className="page-description">This integrated workflow keeps resume evidence, career targeting, profile copy, networking guidance, and branding output connected inside MilVector so refinements stay grounded in your real record.</p>
          </div>
          <aside className="page-hero-aside"><p className="page-hero-aside-title">PHASE 2 OUTPUTS</p><ul className="page-hero-list"><li>Saved profile versions tied to your resume source</li><li>Industry-specific tuning for sharper positioning</li><li>Recruiter-readiness scoring with improvement priorities</li><li>Direct LinkedIn banner image generation</li></ul></aside>
        </div>
      </section>

      {loading ? <section className="section-card border-[var(--accent)]"><p className="text-sm font-semibold text-[var(--accent)]">{activeTask ?? "Running request..."}</p><p className="mt-1 text-xs text-[var(--muted)]">AI processing is in progress. Please wait for the current step to finish.</p></section> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="space-y-4">
          <section className="section-card space-y-4">
            <div><p className="section-title">Step 1: Resume Input</p><p className="section-description">Start with a saved master resume, uploaded master-resume document, or pasted resume text. Saved LinkedIn versions keep that source continuity.</p></div>
            <form className="space-y-4" onSubmit={runResumeAnalysis}>
              <label className="block space-y-1"><span className="text-sm font-medium">Saved Master Resume</span><select className="input" value={masterResumeSelection} onChange={(e) => setMasterResumeSelection(e.target.value)}><option value="">Select a master resume</option>{masterResumeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="block space-y-1"><span className="text-sm font-medium">Pasted Resume Text</span><textarea className="input min-h-40" value={pastedResumeText} onChange={(e) => setPastedResumeText(e.target.value)} placeholder="Paste your master resume text here if you do not want to use a saved source." /></label>
              <button className="btn btn-primary" type="submit" disabled={loading}>Run Step 1</button>
            </form>
          </section>

          <section className="section-card space-y-4">
            <div><p className="section-title">Step 2: Career Targeting</p><p className="section-description">Pick a target direction and add industry-specific tuning so the profile sounds right for the market you want.</p></div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-1"><span className="text-sm font-medium">Target Role</span><input className="input" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="Program Manager" /></label>
              <label className="block space-y-1"><span className="text-sm font-medium">Industry</span><input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Defense Tech" /></label>
              <label className="block space-y-1"><span className="text-sm font-medium">Industry Tuning</span><input className="input" value={industryTuning} onChange={(e) => setIndustryTuning(e.target.value)} placeholder="Federal consulting, SaaS operations, healthcare admin" /></label>
              <label className="block space-y-1"><span className="text-sm font-medium">Version Label</span><input className="input" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="Federal PM v1" /></label>
              <label className="block space-y-1 md:col-span-2"><span className="text-sm font-medium">Secondary Roles</span><input className="input" value={secondaryRoles} onChange={(e) => setSecondaryRoles(e.target.value)} placeholder="Operations Manager, Project Manager" /></label>
              <label className="block space-y-1 md:col-span-2"><span className="text-sm font-medium">Location Strategy / Preference</span><input className="input" value={locationPref} onChange={(e) => setLocationPref(e.target.value)} placeholder="Remote-friendly, East Coast, DC area" /></label>
            </div>
            <button className="btn btn-primary" type="button" onClick={runCareerSuggestions} disabled={loading}>Run Step 2</button>
          </section>

          <section className="section-card space-y-4">
            <div><p className="section-title">Step 3: Profile Generation</p><p className="section-description">Generate LinkedIn copy, networking guidance, and a saved version you can revisit later.</p></div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" type="button" onClick={runProfileGeneration} disabled={loading}>Generate LinkedIn Profile Package</button>
              <button className="btn btn-secondary" type="button" onClick={runProfileScoring} disabled={loading || !profileOutput}>Score Current Profile</button>
            </div>
          </section>

          <section className="section-card space-y-4">
            <div><p className="section-title">Step 4: Banner Prompt + Image</p><p className="section-description">Generate a brand-aligned banner prompt, then optionally create a banner image directly inside MilVector.</p></div>
            <label className="block space-y-1"><span className="text-sm font-medium">Tone</span><input className="input" value={tone} onChange={(e) => setTone(e.target.value)} /></label>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" type="button" onClick={runBannerPrompt} disabled={loading}>Generate Banner Prompt</button>
              <button className="btn btn-secondary" type="button" onClick={runBannerImageGeneration} disabled={loading || !bannerOutput?.banner_prompt}>Generate Banner Image</button>
            </div>
          </section>
        </section>

        <section className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          {(error || notice || copyState) ? <section className="section-card">{error ? <p className="text-sm text-red-700">{error}</p> : null}{notice ? <p className="text-sm text-[var(--accent)]">{notice}</p> : null}{copyState ? <p className="text-sm text-[var(--accent)]">{copyState}</p> : null}</section> : null}

          <section className="section-card space-y-4">
            <div className="flex items-center justify-between gap-3"><div><p className="section-title">Saved Versions</p><p className="text-sm text-[var(--muted)]">Load previous LinkedIn profile packages and continue refining them.</p></div><button className="btn btn-secondary text-sm" type="button" onClick={() => void refreshSavedProfiles()}>Refresh</button></div>
            <div className="space-y-3">{savedProfiles.length === 0 ? <p className="text-sm text-[var(--muted)]">No saved LinkedIn versions yet.</p> : savedProfiles.map((profile) => <article key={profile.id} className="subtle-panel p-4"><p className="font-semibold">{profile.versionLabel || profile.targetRole || "Saved LinkedIn profile"}</p><p className="mt-1 text-xs text-[var(--muted)]">{profile.industry || "Industry not set"}{profile.industryTuning ? ` | ${profile.industryTuning}` : ""} | {new Date(profile.createdAt).toLocaleString()}</p><button className="btn btn-secondary mt-3 text-sm" type="button" onClick={() => applySavedProfile(profile)}>Load Version</button></article>)}</div>
          </section>

          {analysis ? <section className="section-card space-y-4"><button className="btn btn-secondary w-fit text-sm" type="button" onClick={() => void copyText("Positioning summary", analysis.positioning_summary)}>Copy Summary</button><p className="section-title">Resume Analysis</p><p className="text-sm text-[var(--muted)]">{analysis.positioning_summary}</p><ListBlock title="Strengths" items={analysis.strengths} /><ListBlock title="Functional Areas" items={analysis.functional_areas} /><ListBlock title="Leadership Scope" items={analysis.leadership_scope} /><ListBlock title="Role Families" items={analysis.role_families} /><ListBlock title="Skills" items={analysis.skills} /></section> : null}

          {careerSuggestions ? <section className="section-card space-y-4"><button className="btn btn-secondary w-fit text-sm" type="button" onClick={() => void copyText("Career suggestions", careerSuggestions.suggested_roles.map((role) => `${role.title}: ${role.why_fit}`).join("\n"))}>Copy Career Matches</button><p className="section-title">Career Suggestions</p><p className="text-sm text-[var(--muted)]">Recommended seniority: {careerSuggestions.recommended_seniority || "Not specified"}</p>{careerSuggestions.location_strategy ? <p className="text-sm text-[var(--muted)]">{careerSuggestions.location_strategy}</p> : null}<div className="space-y-3">{careerSuggestions.suggested_roles.map((role) => <article key={role.title} className="subtle-panel p-4"><p className="font-semibold">{role.title}</p><p className="mt-1 text-sm text-[var(--muted)]">{role.why_fit}</p><p className="mt-2 text-xs text-[var(--muted)]">Industries: {role.target_industries.join(", ")} | Seniority: {role.seniority}</p></article>)}</div><ListBlock title="Positioning Advice" items={careerSuggestions.positioning_advice} /></section> : null}

          {profileOutput ? <section className="section-card space-y-4"><div className="flex flex-wrap gap-2"><button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Headlines", profileOutput.headlines.join("\n"))}>Copy Headlines</button><button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Skills", profileOutput.skills.join(", "))}>Copy Skills</button></div><p className="section-title">Generated LinkedIn Profile</p>{currentProfileId ? <p className="text-xs text-[var(--muted)]">Saved profile ID: {currentProfileId}</p> : null}<ListBlock title="Headline Options" items={profileOutput.headlines} /><section><h3 className="text-sm font-semibold">About Versions</h3><div className="mt-2 space-y-3">{profileOutput.about_versions.map((about, idx) => <article key={`about-${idx}`} className="subtle-panel p-4"><p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{about}</p><button className="btn btn-secondary mt-3 text-sm" type="button" onClick={() => void copyText(`About version ${idx + 1}`, about)}>Copy</button></article>)}</div></section><section><h3 className="text-sm font-semibold">Experience</h3><div className="mt-2 space-y-3">{profileOutput.experience.map((entry) => <article key={entry.title} className="subtle-panel p-4"><p className="font-semibold">{entry.title}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">{entry.bullets.map((bullet, idx) => <li key={`${entry.title}-${idx}`}>{bullet}</li>)}</ul></article>)}</div></section><ListBlock title="Prioritized Skills" items={profileOutput.skills} /><ListBlock title="Connection Targets" items={profileOutput.networking_guidance.connection_targets} /><ListBlock title="Outreach Messages" items={profileOutput.networking_guidance.outreach_messages} /><ListBlock title="Activation Plan" items={profileOutput.networking_guidance.activation_plan} /></section> : null}

          {profileScore ? <section className="section-card space-y-4"><p className="section-title">Profile Score</p><div className="subtle-panel p-4"><p className="text-3xl font-bold text-[var(--accent)]">{profileScore.overall_score}/100</p><p className="mt-2 text-sm text-[var(--muted)]">{profileScore.recruiter_readiness}</p></div><ListBlock title="Current Strengths" items={profileScore.strengths} /><ListBlock title="Improvement Priorities" items={profileScore.improvement_priorities} /><div className="space-y-3">{profileScore.section_scores.map((section) => <article key={section.section} className="subtle-panel p-4"><p className="font-semibold capitalize">{section.section} {section.score}/{section.max_score}</p><p className="mt-1 text-sm text-[var(--muted)]">{section.rationale}</p><ListBlock title="Recommended Actions" items={section.actions} /></article>)}</div></section> : null}

          {bannerOutput ? <section className="section-card space-y-4"><button className="btn btn-secondary w-fit text-sm" type="button" onClick={() => void copyText("Banner prompt", bannerOutput.banner_prompt)}>Copy Banner Prompt</button><p className="section-title">Banner Prompt</p><pre className="whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{bannerOutput.banner_prompt}</pre><ListBlock title="Style Notes" items={bannerOutput.style_notes} /><ListBlock title="Visual Focus" items={bannerOutput.visual_focus} />{bannerImageUrl ? <section className="space-y-3"><h3 className="text-sm font-semibold">Generated Banner Image</h3><Image alt="Generated LinkedIn banner preview" className="w-full rounded-xl border border-[var(--line)] object-cover" height={512} src={bannerImageUrl} unoptimized width={1536} /><a className="btn btn-secondary text-sm" href={bannerImageUrl} target="_blank" rel="noopener noreferrer">Open Full Image</a></section> : null}</section> : null}
        </section>
      </div>
    </main>
  );
}
