"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Artifact = { id: string; title: string; created_at: string };
type MasterResumeDocument = { id: string; doc_type: "MASTER_RESUME"; filename: string; created_at: string; text_extracted: boolean };
type MasterResumeOption = { value: string; label: string; sourceType: "artifact" | "document"; id: string };
type ResumeAnalysisOutput = { strengths: string[]; functional_areas: string[]; leadership_scope: string[]; role_families: string[]; skills: string[]; civilian_translation_notes: string[]; positioning_summary: string };
type CareerSuggestionsOutput = { suggested_roles: Array<{ title: string; why_fit: string; target_industries: string[]; seniority: string }>; suggested_industries: string[]; recommended_seniority: string; positioning_advice: string[]; location_strategy: string };
type ProfileExperience = { title: string; bullets: string[] };
type LinkedinProfileOutput = { profileId?: string; headlines: string[]; about_versions: string[]; experience: ProfileExperience[]; skills: string[]; networking_guidance: { connection_targets: string[]; outreach_messages: string[]; activation_plan: string[] } };
type BannerOutput = { banner_prompt: string; style_notes: string[]; visual_focus: string[] };
type ProfileScoreOutput = { overall_score: number; recruiter_readiness: string; strengths: string[]; improvement_priorities: string[]; section_scores: Array<{ section: string; score: number; max_score: number; rationale: string; actions: string[] }> };
type SavedLinkedinProfile = { id: string; versionLabel: string | null; resumeText: string; targetRole: string | null; industry: string | null; industryTuning: string | null; locationPref: string | null; analysisContext: { analysis?: ResumeAnalysisOutput; careerSuggestions?: CareerSuggestionsOutput }; careerSuggestions: CareerSuggestionsOutput | Record<string, never>; generatedProfile: LinkedinProfileOutput | Record<string, never>; profileScore: ProfileScoreOutput | Record<string, never>; bannerOutput: BannerOutput | Record<string, never>; bannerImageUrl: string | null; createdAt: string };
type WorkspaceTab = "analysis" | "career" | "profile" | "score" | "banner";

function hasData(value: unknown) {
  return !!value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length > 0;
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
        {items.map((item, idx) => <li key={`${title}-${idx}`}>{item}</li>)}
      </ul>
    </section>
  );
}

function EditListArea({ label, value, onChange, rows = 5 }: { label: string; value: string[]; onChange: (items: string[]) => void; rows?: number }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <textarea className="input" rows={rows} value={value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} />
    </label>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <section className="section-card"><p className="section-title">{title}</p><p className="mt-2 text-sm text-[var(--muted)]">{body}</p></section>;
}

export default function LinkedinBuilderPage() {
  const [masterResumeSelection, setMasterResumeSelection] = useState("");
  const [masterResumeOptions, setMasterResumeOptions] = useState<MasterResumeOption[]>([]);
  const [savedProfiles, setSavedProfiles] = useState<SavedLinkedinProfile[]>([]);
  const [currentProfileId, setCurrentProfileId] = useState("");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [pastedResumeText, setPastedResumeText] = useState("");
  const [resumeSourceText, setResumeSourceText] = useState("");
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
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("analysis");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [copyState, setCopyState] = useState("");

  useEffect(() => {
    async function loadInitial() {
      const [artifactRes, docsRes, savedRes] = await Promise.all([
        fetch("/api/resume-artifacts?type=master_resume"),
        fetch("/api/documents"),
        fetch("/api/tools/linkedin-builder"),
      ]);
      const artifactData = await artifactRes.json().catch(() => ({}));
      const docsData = await docsRes.json().catch(() => ({}));
      const savedData = await savedRes.json().catch(() => ({}));
      const nextOptions: MasterResumeOption[] = [];

      if (artifactRes.ok) {
        nextOptions.push(...((artifactData.artifacts ?? []) as Artifact[]).map((artifact) => ({
          value: `artifact:${artifact.id}`,
          id: artifact.id,
          sourceType: "artifact" as const,
          label: `${artifact.title} (${new Date(artifact.created_at).toLocaleDateString()}) - Saved master resume`,
        })));
      }

      if (docsRes.ok) {
        nextOptions.push(...((docsData.documents ?? []) as MasterResumeDocument[])
          .filter((doc) => doc.doc_type === "MASTER_RESUME")
          .map((doc) => ({
            value: `document:${doc.id}`,
            id: doc.id,
            sourceType: "document" as const,
            label: `${doc.filename} (${new Date(doc.created_at).toLocaleDateString()})${doc.text_extracted ? "" : " - not extracted"} - Uploaded master resume`,
          })));
      }

      setMasterResumeOptions(nextOptions);
      if (nextOptions[0]) setMasterResumeSelection((current) => current || nextOptions[0].value);
      if (savedRes.ok) setSavedProfiles((savedData.profiles ?? []) as SavedLinkedinProfile[]);
    }

    void loadInitial();
  }, []);

  const selectedMasterResume = useMemo(
    () => masterResumeOptions.find((option) => option.value === masterResumeSelection) ?? null,
    [masterResumeOptions, masterResumeSelection]
  );

  function buildSourcePayload() {
    return {
      masterResumeArtifactId: selectedMasterResume?.sourceType === "artifact" ? selectedMasterResume.id : undefined,
      masterResumeDocumentId: selectedMasterResume?.sourceType === "document" ? selectedMasterResume.id : undefined,
      pastedResumeText: pastedResumeText || resumeSourceText || undefined,
    };
  }

  async function refreshSavedProfiles() {
    const res = await fetch("/api/tools/linkedin-builder");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setSavedProfiles((data.profiles ?? []) as SavedLinkedinProfile[]);
  }

  function setWorkspaceFromProfile(profile: SavedLinkedinProfile) {
    setCurrentProfileId(profile.id);
    setDocumentId(null);
    setResumeSourceText(profile.resumeText);
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
    setActiveTab("profile");
    setNotice(`Loaded saved version${profile.versionLabel ? `: ${profile.versionLabel}` : ""}.`);
    setError(null);
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(`${label} copied`);
    } catch {
      setCopyState(`Could not copy ${label.toLowerCase()}`);
    }
    window.setTimeout(() => setCopyState(""), 1500);
  }

  async function postTool(body: Record<string, unknown>, task: string) {
    setLoading(true);
    setActiveTask(task);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/tools/linkedin-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed.");
        return null;
      }
      return data;
    } catch {
      setError("Network error during tool run.");
      return null;
    } finally {
      setLoading(false);
      setActiveTask(null);
    }
  }

  async function runResumeAnalysis(e: FormEvent) {
    e.preventDefault();
    setCurrentProfileId("");
    setDocumentId(null);
    setProfileOutput(null);
    setProfileScore(null);
    setBannerOutput(null);
    setBannerImageUrl(null);
    const data = await postTool({ workflowStage: "resume_analysis", ...buildSourcePayload() }, "Running Step 1: Resume Analysis...");
    if (!data) return;
    setAnalysis(data as ResumeAnalysisOutput);
    setActiveTab("analysis");
    setNotice("Resume analysis complete. Review it, then move into career targeting.");
  }

  async function runCareerSuggestions() {
    const data = await postTool({ workflowStage: "career_suggestions", ...buildSourcePayload(), analysisContext: analysis ?? undefined, locationPref: locationPref || undefined }, "Running Step 2: Career Suggestions...");
    if (!data) return;
    const output = data as CareerSuggestionsOutput;
    setCareerSuggestions(output);
    if (!targetRole && output.suggested_roles[0]) setTargetRole(output.suggested_roles[0].title);
    if (!industry && output.suggested_industries[0]) setIndustry(output.suggested_industries[0]);
    setActiveTab("career");
    setNotice("Career suggestions ready. Select your target direction and industry tuning before generating the profile.");
  }

  async function runProfileGeneration() {
    const data = await postTool({
      workflowStage: "generate_profile",
      ...buildSourcePayload(),
      analysisContext: { analysis, careerSuggestions },
      targetRole,
      secondaryRoles: secondaryRoles.split(",").map((item) => item.trim()).filter(Boolean),
      industry,
      industryTuning,
      locationPref: locationPref || undefined,
      versionLabel: versionLabel || undefined,
    }, "Running Step 3: LinkedIn Profile Generation...");
    if (!data) return;
    setCurrentProfileId((data as LinkedinProfileOutput).profileId ?? "");
    setProfileOutput(data as LinkedinProfileOutput);
    setProfileScore(null);
    setBannerOutput(null);
    setBannerImageUrl(null);
    setActiveTab("profile");
    setNotice("LinkedIn profile package generated. You can edit the sections below before saving a draft document.");
    void refreshSavedProfiles();
  }

  async function runProfileScoring() {
    if (!profileOutput) return;
    const data = await postTool({ workflowStage: "score_profile", profileId: currentProfileId || undefined, profileJson: profileOutput, targetRole, industry, industryTuning }, "Running Phase 2: Profile Scoring...");
    if (!data) return;
    setProfileScore(data as ProfileScoreOutput);
    setActiveTab("score");
    setNotice("Profile score generated. Use the recommendations to refine your editable draft.");
    void refreshSavedProfiles();
  }

  async function runBannerPrompt() {
    const data = await postTool({ workflowStage: "banner_prompt", profileId: currentProfileId || undefined, targetRole, industry, industryTuning, tone }, "Running Step 4: Banner Prompt...");
    if (!data) return;
    setBannerOutput(data as BannerOutput);
    setBannerImageUrl(null);
    setActiveTab("banner");
    setNotice("Banner prompt ready. You can adjust it, copy it, or generate an image.");
    void refreshSavedProfiles();
  }

  async function runBannerImageGeneration() {
    if (!bannerOutput?.banner_prompt) return;
    const data = await postTool({ workflowStage: "banner_image", profileId: currentProfileId || undefined, bannerPrompt: bannerOutput.banner_prompt, targetRole, industry }, "Running Phase 2: Banner Image Generation...");
    if (!data) return;
    setBannerImageUrl((data as { imageUrl?: string | null }).imageUrl ?? null);
    setActiveTab("banner");
    setNotice("Banner image generated and attached to this workspace.");
    void refreshSavedProfiles();
  }

  async function saveDraftToDocuments() {
    if (!profileOutput) return;
    const data = await postTool({
      workflowStage: "save_document",
      profileJson: profileOutput,
      analysisContext: { profileScore, bannerOutput },
      targetRole,
      industry,
      industryTuning,
      locationPref,
      versionLabel,
    }, "Saving editable LinkedIn draft to Documents...");
    if (!data) return;
    setDocumentId((data as { documentId: string }).documentId);
    setNotice("Editable LinkedIn draft saved to Documents and your private library.");
  }

  function updateExperienceTitle(index: number, title: string) {
    setProfileOutput((current) => current ? { ...current, experience: current.experience.map((item, idx) => idx === index ? { ...item, title } : item) } : current);
  }

  function updateExperienceBullets(index: number, bullets: string[]) {
    setProfileOutput((current) => current ? { ...current, experience: current.experience.map((item, idx) => idx === index ? { ...item, bullets } : item) } : current);
  }

  function buildProfileText(profile: LinkedinProfileOutput) {
    return [
      "Headlines",
      ...profile.headlines,
      "",
      "About Versions",
      ...profile.about_versions,
      "",
      "Experience",
      ...profile.experience.flatMap((entry) => [entry.title, ...entry.bullets.map((bullet) => `- ${bullet}`), ""]),
      "Skills",
      ...profile.skills,
      "",
      "Connection Targets",
      ...profile.networking_guidance.connection_targets,
      "",
      "Outreach Messages",
      ...profile.networking_guidance.outreach_messages,
      "",
      "Activation Plan",
      ...profile.networking_guidance.activation_plan,
    ].join("\n");
  }

  const tabs: Array<{ id: WorkspaceTab; label: string; disabled: boolean }> = [
    { id: "analysis", label: "Analysis", disabled: !analysis },
    { id: "career", label: "Career", disabled: !careerSuggestions },
    { id: "profile", label: "Profile", disabled: !profileOutput },
    { id: "score", label: "Score", disabled: !profileScore },
    { id: "banner", label: "Banner", disabled: !bannerOutput },
  ];

  return (
    <main className="page-shell">
      <section className="page-hero">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker">LINKEDIN PROFILE BUILDER</p>
            <h1 className="page-title">Build, refine, and preserve a stronger LinkedIn presence from your master resume.</h1>
            <p className="page-description">This workspace keeps the flow connected across analysis, targeting, editing, scoring, and branding while also letting you save an editable draft into Documents so your work survives page changes.</p>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">NEXT BEST ACTIONS</p>
            <ul className="page-hero-list">
              <li>Generate a profile package, then edit the sections before saving.</li>
              <li>Use the score tab to improve weak sections instead of rerunning blindly.</li>
              <li>Save a draft document when you reach a version you want to keep working from.</li>
            </ul>
          </aside>
        </div>
      </section>

      {loading ? <section className="section-card border-[var(--accent)]"><p className="text-sm font-semibold text-[var(--accent)]">{activeTask ?? "Running request..."}</p><p className="mt-1 text-xs text-[var(--muted)]">AI processing is in progress. Please wait for the current step to finish.</p></section> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className="space-y-4">
          <section className="section-card space-y-4">
            <div><p className="section-title">Workspace Summary</p><p className="section-description">Keep your current target direction visible while you edit and save draft versions.</p></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <div className="subtle-panel p-3"><p className="text-xs font-semibold tracking-wide text-[var(--accent)]">Target Role</p><p className="mt-1 text-sm">{targetRole || "Not set"}</p></div>
              <div className="subtle-panel p-3"><p className="text-xs font-semibold tracking-wide text-[var(--accent)]">Industry</p><p className="mt-1 text-sm">{industry || "Not set"}</p></div>
              <div className="subtle-panel p-3"><p className="text-xs font-semibold tracking-wide text-[var(--accent)]">Version</p><p className="mt-1 text-sm">{versionLabel || "Unsaved label"}</p></div>
              <div className="subtle-panel p-3"><p className="text-xs font-semibold tracking-wide text-[var(--accent)]">Saved Draft</p><p className="mt-1 text-sm">{documentId ? "Saved to Documents" : "Not saved yet"}</p></div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button className="btn btn-primary" type="button" onClick={saveDraftToDocuments} disabled={loading || !profileOutput}>Save To Documents</button>
              {documentId ? <a className="btn btn-secondary" href={`/api/documents/${documentId}/download`}>Open Saved Draft</a> : null}
              <button className="btn btn-secondary" type="button" onClick={runProfileScoring} disabled={loading || !profileOutput}>Score</button>
              <button className="btn btn-secondary" type="button" onClick={runBannerPrompt} disabled={loading || !profileOutput}>Banner</button>
            </div>
          </section>

          <section className="section-card space-y-4">
            <div><p className="section-title">Step 1: Resume Input</p><p className="section-description">Start with a saved master resume, uploaded document, or pasted text.</p></div>
            <form className="space-y-4" onSubmit={runResumeAnalysis}>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Saved Master Resume</span>
                <select className="input" value={masterResumeSelection} onChange={(e) => setMasterResumeSelection(e.target.value)}>
                  <option value="">Select a master resume</option>
                  {masterResumeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Pasted Resume Text</span>
                <textarea className="input min-h-40" value={pastedResumeText} onChange={(e) => setPastedResumeText(e.target.value)} placeholder="Paste resume text here if you want to work without a saved source." />
              </label>
              <button className="btn btn-primary w-full sm:w-auto" type="submit" disabled={loading}>Run Step 1</button>
            </form>
          </section>

          <section className="section-card space-y-4">
            <div><p className="section-title">Step 2: Career Targeting</p><p className="section-description">Pick your target direction and the industry lens you want the profile tuned for.</p></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              <label className="block space-y-1"><span className="text-sm font-medium">Target Role</span><input className="input" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="Program Manager" /></label>
              <label className="block space-y-1"><span className="text-sm font-medium">Industry</span><input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Defense Tech" /></label>
              <label className="block space-y-1"><span className="text-sm font-medium">Industry Tuning</span><input className="input" value={industryTuning} onChange={(e) => setIndustryTuning(e.target.value)} placeholder="Federal consulting, SaaS operations, healthcare admin" /></label>
              <label className="block space-y-1"><span className="text-sm font-medium">Version Label</span><input className="input" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="Federal PM v1" /></label>
              <label className="block space-y-1"><span className="text-sm font-medium">Secondary Roles</span><input className="input" value={secondaryRoles} onChange={(e) => setSecondaryRoles(e.target.value)} placeholder="Operations Manager, Project Manager" /></label>
              <label className="block space-y-1"><span className="text-sm font-medium">Location Preference</span><input className="input" value={locationPref} onChange={(e) => setLocationPref(e.target.value)} placeholder="Remote-friendly, East Coast, DC area" /></label>
            </div>
            <button className="btn btn-primary w-full sm:w-auto" type="button" onClick={runCareerSuggestions} disabled={loading}>Run Step 2</button>
          </section>

          <section className="section-card space-y-4">
            <div><p className="section-title">Step 3: Generate + Refine</p><p className="section-description">Generate the LinkedIn package, then refine it in the editable workspace before saving a draft document.</p></div>
            <button className="btn btn-primary w-full sm:w-auto" type="button" onClick={runProfileGeneration} disabled={loading}>Generate LinkedIn Profile Package</button>
          </section>

          <section className="section-card space-y-4">
            <div><p className="section-title">Saved Versions</p><p className="section-description">Load previous LinkedIn profile packages and keep refining from that point.</p></div>
            <div className="space-y-3">
              {savedProfiles.length === 0 ? <p className="text-sm text-[var(--muted)]">No saved LinkedIn versions yet.</p> : savedProfiles.map((profile) => (
                <article key={profile.id} className="subtle-panel p-4">
                  <p className="font-semibold">{profile.versionLabel || profile.targetRole || "Saved LinkedIn profile"}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{profile.industry || "Industry not set"}{profile.industryTuning ? ` | ${profile.industryTuning}` : ""} | {new Date(profile.createdAt).toLocaleString()}</p>
                  <button className="btn btn-secondary mt-3 w-full text-sm sm:w-auto" type="button" onClick={() => setWorkspaceFromProfile(profile)}>Load Version</button>
                </article>
              ))}
            </div>
          </section>
        </section>

        <section className="space-y-4">
          {(error || notice || copyState) ? <section className="section-card">{error ? <p className="text-sm text-red-700">{error}</p> : null}{notice ? <p className="text-sm text-[var(--accent)]">{notice}</p> : null}{copyState ? <p className="text-sm text-[var(--accent)]">{copyState}</p> : null}</section> : null}

          <section className="section-card space-y-4">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              {tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "btn btn-primary text-sm" : "btn btn-secondary text-sm"} type="button" disabled={tab.disabled} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
            </div>

            {activeTab === "analysis" && analysis ? <section className="space-y-4"><div className="flex flex-wrap gap-2"><button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Positioning summary", analysis.positioning_summary)}>Copy Summary</button><button className="btn btn-secondary text-sm" type="button" onClick={runCareerSuggestions} disabled={loading}>See Career Matches</button></div><p className="section-title">Resume Analysis</p><p className="text-sm text-[var(--muted)]">{analysis.positioning_summary}</p><ListBlock title="Strengths" items={analysis.strengths} /><ListBlock title="Functional Areas" items={analysis.functional_areas} /><ListBlock title="Leadership Scope" items={analysis.leadership_scope} /><ListBlock title="Role Families" items={analysis.role_families} /><ListBlock title="Skills" items={analysis.skills} /></section> : null}

            {activeTab === "career" && careerSuggestions ? <section className="space-y-4"><div className="flex flex-wrap gap-2"><button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Career suggestions", careerSuggestions.suggested_roles.map((role) => `${role.title}: ${role.why_fit}`).join("\n"))}>Copy Career Matches</button><button className="btn btn-secondary text-sm" type="button" onClick={runProfileGeneration} disabled={loading}>Generate Profile</button></div><p className="section-title">Career Suggestions</p><p className="text-sm text-[var(--muted)]">Recommended seniority: {careerSuggestions.recommended_seniority || "Not specified"}</p>{careerSuggestions.location_strategy ? <p className="text-sm text-[var(--muted)]">{careerSuggestions.location_strategy}</p> : null}<div className="grid gap-3 lg:grid-cols-2">{careerSuggestions.suggested_roles.map((role) => <article key={role.title} className="subtle-panel p-4"><p className="font-semibold">{role.title}</p><p className="mt-1 text-sm text-[var(--muted)]">{role.why_fit}</p><p className="mt-2 text-xs text-[var(--muted)]">Industries: {role.target_industries.join(", ")} | Seniority: {role.seniority}</p></article>)}</div><ListBlock title="Positioning Advice" items={careerSuggestions.positioning_advice} /></section> : null}

            {activeTab === "profile" && profileOutput ? <section className="space-y-4"><div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"><button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Profile package", buildProfileText(profileOutput))}>Copy Profile</button><button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Headlines", profileOutput.headlines.join("\n"))}>Copy Headlines</button><button className="btn btn-secondary text-sm" type="button" onClick={saveDraftToDocuments} disabled={loading}>Save Draft Document</button></div><p className="section-title">Editable LinkedIn Profile</p><EditListArea label="Headline Options" value={profileOutput.headlines} onChange={(headlines) => setProfileOutput((current) => current ? { ...current, headlines } : current)} rows={6} /><EditListArea label="Prioritized Skills" value={profileOutput.skills} onChange={(skills) => setProfileOutput((current) => current ? { ...current, skills } : current)} rows={8} /><EditListArea label="Connection Targets" value={profileOutput.networking_guidance.connection_targets} onChange={(connection_targets) => setProfileOutput((current) => current ? { ...current, networking_guidance: { ...current.networking_guidance, connection_targets } } : current)} rows={5} /><EditListArea label="Activation Plan" value={profileOutput.networking_guidance.activation_plan} onChange={(activation_plan) => setProfileOutput((current) => current ? { ...current, networking_guidance: { ...current.networking_guidance, activation_plan } } : current)} rows={6} /><EditListArea label="Outreach Messages" value={profileOutput.networking_guidance.outreach_messages} onChange={(outreach_messages) => setProfileOutput((current) => current ? { ...current, networking_guidance: { ...current.networking_guidance, outreach_messages } } : current)} rows={6} /><section className="space-y-3"><h3 className="text-sm font-semibold">About Versions</h3>{profileOutput.about_versions.map((about, idx) => <label key={`about-${idx}`} className="block space-y-1"><span className="text-sm font-medium">About {idx + 1}</span><textarea className="input" rows={8} value={about} onChange={(e) => setProfileOutput((current) => current ? { ...current, about_versions: current.about_versions.map((item, itemIdx) => itemIdx === idx ? e.target.value : item) } : current)} /></label>)}</section><section className="space-y-3"><h3 className="text-sm font-semibold">Experience</h3>{profileOutput.experience.map((entry, idx) => <article key={`exp-${idx}`} className="subtle-panel p-4"><label className="block space-y-1"><span className="text-sm font-medium">Role Title</span><input className="input" value={entry.title} onChange={(e) => updateExperienceTitle(idx, e.target.value)} /></label><div className="mt-3"><EditListArea label="Bullets" value={entry.bullets} onChange={(bullets) => updateExperienceBullets(idx, bullets)} rows={6} /></div></article>)}</section></section> : null}

            {activeTab === "score" && profileScore ? <section className="space-y-4"><p className="section-title">Profile Score</p><div className="subtle-panel p-4"><p className="text-3xl font-bold text-[var(--accent)]">{profileScore.overall_score}/100</p><p className="mt-2 text-sm text-[var(--muted)]">{profileScore.recruiter_readiness}</p></div><ListBlock title="Current Strengths" items={profileScore.strengths} /><ListBlock title="Improvement Priorities" items={profileScore.improvement_priorities} /><div className="space-y-3">{profileScore.section_scores.map((section) => <article key={section.section} className="subtle-panel p-4"><p className="font-semibold capitalize">{section.section} {section.score}/{section.max_score}</p><p className="mt-1 text-sm text-[var(--muted)]">{section.rationale}</p><ListBlock title="Recommended Actions" items={section.actions} /></article>)}</div></section> : null}

            {activeTab === "banner" && bannerOutput ? <section className="space-y-4"><div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"><button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Banner prompt", bannerOutput.banner_prompt)}>Copy Banner Prompt</button><button className="btn btn-secondary text-sm" type="button" onClick={runBannerImageGeneration} disabled={loading}>Generate Banner Image</button></div><p className="section-title">Banner Workspace</p><label className="block space-y-1"><span className="text-sm font-medium">Tone</span><input className="input" value={tone} onChange={(e) => setTone(e.target.value)} /></label><label className="block space-y-1"><span className="text-sm font-medium">Banner Prompt</span><textarea className="input" rows={8} value={bannerOutput.banner_prompt} onChange={(e) => setBannerOutput((current) => current ? { ...current, banner_prompt: e.target.value } : current)} /></label><EditListArea label="Style Notes" value={bannerOutput.style_notes} onChange={(style_notes) => setBannerOutput((current) => current ? { ...current, style_notes } : current)} rows={5} /><EditListArea label="Visual Focus" value={bannerOutput.visual_focus} onChange={(visual_focus) => setBannerOutput((current) => current ? { ...current, visual_focus } : current)} rows={5} />{bannerImageUrl ? <section className="space-y-3"><h3 className="text-sm font-semibold">Generated Banner Image</h3><Image alt="Generated LinkedIn banner preview" className="w-full rounded-xl border border-[var(--line)] object-cover" height={512} src={bannerImageUrl} unoptimized width={1536} /><a className="btn btn-secondary text-sm" href={bannerImageUrl} target="_blank" rel="noopener noreferrer">Open Full Image</a></section> : null}</section> : null}

            {activeTab === "analysis" && !analysis ? <EmptyState title="Run Resume Analysis" body="Start with Step 1 to populate the analysis workspace." /> : null}
            {activeTab === "career" && !careerSuggestions ? <EmptyState title="Generate Career Matches" body="Run Step 2 after analysis to populate the career workspace." /> : null}
            {activeTab === "profile" && !profileOutput ? <EmptyState title="Generate A Profile Package" body="Run Step 3 to create an editable LinkedIn workspace." /> : null}
            {activeTab === "score" && !profileScore ? <EmptyState title="Score Your Draft" body="Generate a profile first, then run scoring to get section-by-section guidance." /> : null}
            {activeTab === "banner" && !bannerOutput ? <EmptyState title="Create Banner Assets" body="Generate a banner prompt to populate the branding workspace." /> : null}
          </section>
        </section>
      </div>
    </main>
  );
}
