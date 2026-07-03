"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { LoadingBlock } from "@/components/tools/loading-block";
import { ToolAlert } from "@/components/tools/tool-alert";
import { ActionBar } from "@/components/tools/action-bar";

// ─── Types ────────────────────────────────────────────────────────────

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
type StageState = "pending" | "active" | "complete";

// ─── Helpers ──────────────────────────────────────────────────────────

function hasData(value: unknown) {
  return !!value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length > 0;
}

// ─── Sub-components ───────────────────────────────────────────────────

function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{title}</p>
      <ul className="flex flex-col gap-1">
        {items.map((item, idx) => (
          <li key={`${title}-${idx}`} className="flex gap-2 text-sm">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditListArea({ label, value, onChange, rows = 5 }: { label: string; value: string[]; onChange: (items: string[]) => void; rows?: number }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <textarea
        className="input"
        rows={rows}
        value={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n").map((item) => item.trim()).filter(Boolean))}
      />
    </label>
  );
}

function ScoreRing({ score, size = 88 }: { score: number; size?: number }) {
  const strokeW = 7;
  const r = (size - strokeW * 2) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? "var(--accent)" : score >= 50 ? "#d4a017" : "#dc4c4c";
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`Score: ${score} out of 100`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--line)" strokeWidth={strokeW} />
        <circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke={color} strokeWidth={strokeW}
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-tight">
        <span className="font-bold" style={{ fontSize: size * 0.23, color }}>{score}</span>
        <span className="text-[var(--muted)]" style={{ fontSize: size * 0.12 }}>/100</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function LinkedinBuilderPage() {
  // ── State ──────────────────────────────────────────────────────────
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
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initial data load ──────────────────────────────────────────────
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
        nextOptions.push(...((artifactData.artifacts ?? []) as Artifact[]).map((a) => ({
          value: `artifact:${a.id}`,
          id: a.id,
          sourceType: "artifact" as const,
          label: `${a.title} (${new Date(a.created_at).toLocaleDateString()}) — Saved master resume`,
        })));
      }
      if (docsRes.ok) {
        nextOptions.push(...((docsData.documents ?? []) as MasterResumeDocument[])
          .filter((d) => d.doc_type === "MASTER_RESUME")
          .map((d) => ({
            value: `document:${d.id}`,
            id: d.id,
            sourceType: "document" as const,
            label: `${d.filename} (${new Date(d.created_at).toLocaleDateString()})${d.text_extracted ? "" : " — not ready yet"} — Uploaded`,
          })));
      }
      setMasterResumeOptions(nextOptions);
      if (nextOptions[0]) setMasterResumeSelection((c) => c || nextOptions[0].value);
      if (savedRes.ok) setSavedProfiles((savedData.profiles ?? []) as SavedLinkedinProfile[]);
    }
    void loadInitial();
  }, []);

  // ── Navigation guard ───────────────────────────────────────────────
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (profileOutput && !documentId) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [profileOutput, documentId]);

  // ── 30s debounce auto-save ─────────────────────────────────────────
  useEffect(() => {
    if (!profileOutput || !currentProfileId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void fetch("/api/tools/linkedin-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowStage: "update_profile",
          profileId: currentProfileId,
          profileJson: profileOutput,
        }),
      }).then((r) => { if (r.ok) setLastAutoSave(new Date()); });
    }, 30000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [profileOutput, currentProfileId]);

  // ── Derived ────────────────────────────────────────────────────────
  const selectedMasterResume = useMemo(
    () => masterResumeOptions.find((o) => o.value === masterResumeSelection) ?? null,
    [masterResumeOptions, masterResumeSelection]
  );

  const stageBarStages = useMemo(
    () =>
      [
        { label: "Analysis", state: (analysis ? "complete" : "active") as StageState },
        { label: "Career", state: (careerSuggestions ? "complete" : analysis ? "active" : "pending") as StageState },
        { label: "Profile", state: (profileOutput ? "complete" : careerSuggestions ? "active" : "pending") as StageState },
        { label: "Score", state: (profileScore ? "complete" : profileOutput ? "active" : "pending") as StageState },
        { label: "Banner", state: (bannerOutput ? "complete" : profileOutput ? "active" : "pending") as StageState },
      ],
    [analysis, careerSuggestions, profileOutput, profileScore, bannerOutput]
  );

  // ── Utilities ──────────────────────────────────────────────────────
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
    setLastAutoSave(null);
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
    setNotice(`Loaded version${profile.versionLabel ? `: ${profile.versionLabel}` : ""}. Edits auto-save after 30 seconds.`);
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
      const res = await fetch("/api/tools/linkedin-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Something went wrong on our end. Try again in a few seconds."); return null; }
      return data;
    } catch {
      setError("That didn't go through. Check your connection and try again — your work is still here.");
      return null;
    } finally {
      setLoading(false);
      setActiveTask(null);
    }
  }

  // ── Steps 1+2 auto-sequence ────────────────────────────────────────
  async function runAnalysisAndCareer(e: FormEvent) {
    e.preventDefault();
    setCurrentProfileId("");
    setDocumentId(null);
    setLastAutoSave(null);
    setAnalysis(null);
    setCareerSuggestions(null);
    setProfileOutput(null);
    setProfileScore(null);
    setBannerOutput(null);
    setBannerImageUrl(null);
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      // Step 1: Resume Analysis
      setActiveTask("Running Step 1: Resume Analysis…");
      const r1 = await fetch("/api/tools/linkedin-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowStage: "resume_analysis", ...buildSourcePayload() }),
      });
      const d1 = await r1.json().catch(() => ({}));
      if (!r1.ok) { setError(d1.error ?? "Resume analysis failed."); return; }
      const analysisResult = d1 as ResumeAnalysisOutput;
      setAnalysis(analysisResult);

      // Step 2: Career Suggestions (auto-chained)
      setActiveTask("Running Step 2: Career Matching…");
      const r2 = await fetch("/api/tools/linkedin-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowStage: "career_suggestions",
          ...buildSourcePayload(),
          analysisContext: analysisResult,
          locationPref: locationPref || undefined,
        }),
      });
      const d2 = await r2.json().catch(() => ({}));
      if (!r2.ok) { setError(d2.error ?? "Career matching failed."); return; }
      const careerResult = d2 as CareerSuggestionsOutput;
      setCareerSuggestions(careerResult);
      if (!targetRole && careerResult.suggested_roles[0]) setTargetRole(careerResult.suggested_roles[0].title);
      if (!industry && careerResult.suggested_industries[0]) setIndustry(careerResult.suggested_industries[0]);
      setActiveTab("career");
      setNotice("Analysis and career matching complete. Review the career tab, adjust your target role and industry, then generate your profile.");
    } catch {
      setError("That didn't go through. Check your connection and try again — your resume text is still here.");
    } finally {
      setLoading(false);
      setActiveTask(null);
    }
  }

  async function rerunCareerSuggestions() {
    const data = await postTool(
      { workflowStage: "career_suggestions", ...buildSourcePayload(), analysisContext: analysis ?? undefined, locationPref: locationPref || undefined },
      "Running Step 2: Career Matching…"
    );
    if (!data) return;
    const output = data as CareerSuggestionsOutput;
    setCareerSuggestions(output);
    if (!targetRole && output.suggested_roles[0]) setTargetRole(output.suggested_roles[0].title);
    if (!industry && output.suggested_industries[0]) setIndustry(output.suggested_industries[0]);
    setNotice("Career matching updated.");
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
    }, "Running Step 3: LinkedIn Profile Generation…");
    if (!data) return;
    setCurrentProfileId((data as LinkedinProfileOutput).profileId ?? "");
    setProfileOutput(data as LinkedinProfileOutput);
    setProfileScore(null);
    setBannerOutput(null);
    setBannerImageUrl(null);
    setLastAutoSave(null);
    setDocumentId(null);
    setActiveTab("profile");
    setNotice("Profile package generated. Edit the sections below — changes auto-save after 30 seconds.");
    void refreshSavedProfiles();
  }

  async function runProfileScoring() {
    if (!profileOutput) return;
    const data = await postTool(
      { workflowStage: "score_profile", profileId: currentProfileId || undefined, profileJson: profileOutput, targetRole, industry, industryTuning },
      "Scoring Profile…"
    );
    if (!data) return;
    setProfileScore(data as ProfileScoreOutput);
    setActiveTab("score");
    setNotice("Profile scored. Use the section feedback to refine your draft.");
    void refreshSavedProfiles();
  }

  async function runBannerPrompt() {
    const data = await postTool(
      { workflowStage: "banner_prompt", profileId: currentProfileId || undefined, targetRole, industry, industryTuning, tone },
      "Generating Banner Prompt…"
    );
    if (!data) return;
    setBannerOutput(data as BannerOutput);
    setBannerImageUrl(null);
    setActiveTab("banner");
    setNotice("Banner prompt ready. Edit and copy it, or generate an image.");
    void refreshSavedProfiles();
  }

  async function runBannerImageGeneration() {
    if (!bannerOutput?.banner_prompt) return;
    const data = await postTool(
      { workflowStage: "banner_image", profileId: currentProfileId || undefined, bannerPrompt: bannerOutput.banner_prompt, targetRole, industry },
      "Generating Banner Image…"
    );
    if (!data) return;
    setBannerImageUrl((data as { imageUrl?: string | null }).imageUrl ?? null);
    setNotice("Banner image generated.");
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
    }, "Saving draft to Documents…");
    if (!data) return;
    setDocumentId((data as { documentId: string }).documentId);
    setNotice("Draft saved to Documents. It's safe to leave this page.");
  }

  // ── Profile editing helpers ────────────────────────────────────────
  function updateExperienceTitle(index: number, title: string) {
    setProfileOutput((c) => c ? { ...c, experience: c.experience.map((item, idx) => idx === index ? { ...item, title } : item) } : c);
  }

  function updateExperienceBullets(index: number, bullets: string[]) {
    setProfileOutput((c) => c ? { ...c, experience: c.experience.map((item, idx) => idx === index ? { ...item, bullets } : item) } : c);
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
      ...profile.experience.flatMap((e) => [e.title, ...e.bullets.map((b) => `- ${b}`), ""]),
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

  // ─── JSX ──────────────────────────────────────────────────────────

  return (
    <main className="page-shell">

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">LINKEDIN PROFILE BUILDER</p>
            <h1 className="page-title">
              Build your whole LinkedIn profile{" "}
              <span className="gradient-text">from your master resume.</span>
            </h1>
            <p className="page-description">
              Start with your master resume and get a complete LinkedIn profile — headline, about section, experience, and a banner. Edit anything; your changes save automatically.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">HOW TO GET THE MOST OUT OF IT</p>
            <ul className="page-hero-list">
              <li>Set your location preference before you start</li>
              <li>Edit the headline and about section before scoring</li>
              <li>Save to Documents when you have a version you like</li>
              <li>Use the score tab to see which sections need work</li>
            </ul>
          </aside>
        </div>
        <div className="hero-trust-strip -mx-7 -mb-7 mt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {["Resume Analysis", "Career Matching", "Profile + Score", "Banner"].map((label) => (
              <div key={label} className="hero-trust-item">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#39a67f" }} aria-hidden="true" />
                <span className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.65)" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stage bar ─────────────────────────────────────────────── */}
      <div className="tool-stage-bar" role="list" aria-label="Workflow stages">
        {stageBarStages.map((stage, idx) => (
          <div
            key={stage.label}
            className="tool-stage-step"
            data-state={stage.state}
            role="listitem"
            aria-current={stage.state === "active" ? "step" : undefined}
          >
            <span className="tool-stage-num" aria-hidden>
              {stage.state === "complete" ? "✓" : idx + 1}
            </span>
            <span className="hidden sm:inline">{stage.label}</span>
          </div>
        ))}
      </div>

      {/* ── Main layout ────────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">

        {/* ── LEFT: Controls ─────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Workspace Summary */}
          <section className="tool-section">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="tool-kicker">WORKSPACE</p>
                <p className="section-title mt-0.5">{targetRole || "No target role set"}</p>
                <p className="text-sm text-[var(--muted)]">{industry || "Industry not set"}{industryTuning && industryTuning !== "General civilian hiring" ? ` · ${industryTuning}` : ""}</p>
              </div>
              {profileScore && <ScoreRing score={profileScore.overall_score} size={72} />}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              {versionLabel && <span className="tool-badge tool-badge-success" style={{ fontSize: "0.65rem" }}>{versionLabel}</span>}
              {documentId
                ? <span className="tool-badge tool-badge-success" style={{ fontSize: "0.65rem" }}>Saved to Documents</span>
                : profileOutput
                ? <span className="tool-badge tool-badge-warn" style={{ fontSize: "0.65rem" }}>Unsaved — edits lost on close</span>
                : null}
              {lastAutoSave && (
                <span>Auto-saved {lastAutoSave.toLocaleTimeString()}</span>
              )}
            </div>

            <ActionBar>
              <button className="btn btn-primary text-sm" type="button" onClick={saveDraftToDocuments} disabled={loading || !profileOutput}>
                Save to Documents
              </button>
              {documentId && (
                <a className="btn btn-secondary text-sm" href={`/api/documents/${documentId}/download`}>
                  Open Draft
                </a>
              )}
              <button className="btn btn-secondary text-sm" type="button" onClick={runProfileScoring} disabled={loading || !profileOutput}>
                Score
              </button>
              <button className="btn btn-secondary text-sm" type="button" onClick={runBannerPrompt} disabled={loading || !profileOutput}>
                Banner
              </button>
            </ActionBar>
          </section>

          {/* Steps 1+2: Resume Input */}
          <section className="tool-section">
            <div>
              <p className="tool-kicker">STEPS 1+2</p>
              <p className="section-title mt-0.5">Analysis + Career Matching</p>
              <p className="section-description">
                Both steps run together automatically. Set your location preference first if it matters to the career suggestions.
              </p>
            </div>

            <form className="flex flex-col gap-3" onSubmit={runAnalysisAndCareer}>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Master Resume</span>
                <select className="input" value={masterResumeSelection} onChange={(e) => setMasterResumeSelection(e.target.value)}>
                  <option value="">Select a master resume</option>
                  {masterResumeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  Pasted Resume <span className="font-normal text-[var(--muted)]">(optional if source selected)</span>
                </span>
                <textarea
                  className="input min-h-28"
                  value={pastedResumeText}
                  onChange={(e) => setPastedResumeText(e.target.value)}
                  placeholder="Paste resume text if not using a saved source…"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  Location Preference <span className="font-normal text-[var(--muted)]">(optional)</span>
                </span>
                <input
                  className="input"
                  value={locationPref}
                  onChange={(e) => setLocationPref(e.target.value)}
                  placeholder="Remote, DC area, East Coast…"
                />
              </label>

              <button className="btn btn-primary w-full sm:w-auto" type="submit" disabled={loading}>
                Run Steps 1+2 (Analysis + Career)
              </button>
            </form>
          </section>

          {/* Step 3: Targeting + Generate */}
          <section className="tool-section">
            <div>
              <p className="tool-kicker">STEP 3</p>
              <p className="section-title mt-0.5">Generate Profile</p>
              <p className="section-description">
                These fields are pre-filled from Step 2. Adjust before generating.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Target Role</span>
                <input className="input" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="Program Manager" />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Industry</span>
                <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Defense Tech" />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Industry Tuning</span>
                <input className="input" value={industryTuning} onChange={(e) => setIndustryTuning(e.target.value)} placeholder="Federal consulting, SaaS ops" />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Version Label</span>
                <input className="input" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="Federal PM v1" />
              </label>
              <label className="block space-y-1 sm:col-span-2 xl:col-span-1">
                <span className="text-sm font-medium">
                  Secondary Roles <span className="font-normal text-[var(--muted)]">(comma-separated)</span>
                </span>
                <input className="input" value={secondaryRoles} onChange={(e) => setSecondaryRoles(e.target.value)} placeholder="Ops Manager, Project Manager" />
              </label>
            </div>

            <button className="btn btn-primary w-full sm:w-auto" type="button" onClick={runProfileGeneration} disabled={loading}>
              Generate LinkedIn Profile Package
            </button>
          </section>

          {/* Version History */}
          <section className="tool-section">
            <p className="tool-kicker">VERSION HISTORY</p>
            <p className="section-title mt-0.5">Saved Versions</p>
            {savedProfiles.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No saved LinkedIn versions yet. Generate a profile to start.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {savedProfiles.map((profile) => {
                  const score = hasData(profile.profileScore) ? (profile.profileScore as ProfileScoreOutput).overall_score : null;
                  return (
                    <article key={profile.id} className="subtle-panel p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-sm">
                            {profile.versionLabel || profile.targetRole || "Saved LinkedIn profile"}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--muted)]">
                            {profile.industry || "Industry not set"} · {new Date(profile.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        {score !== null && (
                          <span className="tool-badge tool-badge-success shrink-0" style={{ fontSize: "0.65rem" }}>
                            {score}/100
                          </span>
                        )}
                      </div>
                      <button
                        className="btn btn-secondary mt-3 w-full text-sm"
                        type="button"
                        onClick={() => setWorkspaceFromProfile(profile)}
                      >
                        Load Version
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── RIGHT: Workspace ───────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Loading */}
          {loading && (
            <LoadingBlock
              task={activeTask ?? "Processing…"}
              detail={
                activeTask?.includes("1")
                  ? "Analyzing your resume for strengths, skills, and role families. Usually 15–25 seconds."
                  : activeTask?.includes("2")
                  ? "Matching your profile to civilian career paths. Usually 15–20 seconds."
                  : activeTask?.includes("3")
                  ? "Generating your full LinkedIn profile package. Usually 30–60 seconds."
                  : activeTask?.includes("Score") || activeTask?.includes("scor")
                  ? "Scoring your profile against recruiter standards. Usually 15–25 seconds."
                  : activeTask?.includes("Banner") || activeTask?.includes("banner")
                  ? "Creating your banner assets. Image generation may take 20–40 seconds."
                  : "AI processing is in progress — please wait."
              }
            />
          )}

          {/* Alerts */}
          {!loading && error && (
            <ToolAlert variant="error" title="Something went wrong">
              <p className="text-sm">{error}</p>
            </ToolAlert>
          )}
          {!loading && notice && (
            <ToolAlert variant="info">
              <p className="text-sm">{notice}</p>
            </ToolAlert>
          )}
          {!loading && copyState && (
            <ToolAlert variant="info">
              <p className="text-sm">{copyState}</p>
            </ToolAlert>
          )}

          {/* Workspace card with tabs */}
          <div className="tool-output-card">
            {/* Tab bar */}
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40"
                  }`}
                  type="button"
                  disabled={tab.disabled}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Analysis tab ─────────────────────────────────── */}
            {activeTab === "analysis" && analysis && (
              <div className="flex flex-col gap-4 pt-1">
                <p className="text-sm leading-relaxed text-[var(--muted)]">{analysis.positioning_summary}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ListBlock title="Strengths" items={analysis.strengths} />
                  <ListBlock title="Functional Areas" items={analysis.functional_areas} />
                  <ListBlock title="Leadership Scope" items={analysis.leadership_scope} />
                  <ListBlock title="Role Families" items={analysis.role_families} />
                  <ListBlock title="Key Skills" items={analysis.skills} />
                </div>
                <ActionBar>
                  <button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Positioning summary", analysis.positioning_summary)}>
                    Copy Summary
                  </button>
                  <button className="btn btn-secondary text-sm" type="button" onClick={rerunCareerSuggestions} disabled={loading}>
                    Rerun Career Matching
                  </button>
                </ActionBar>
              </div>
            )}
            {activeTab === "analysis" && !analysis && (
              <div className="tool-empty">
                <p className="font-medium">Run Steps 1+2 to populate analysis</p>
                <p className="text-xs">Select your master resume and click the button in the left panel.</p>
              </div>
            )}

            {/* ── Career tab ───────────────────────────────────── */}
            {activeTab === "career" && careerSuggestions && (
              <div className="flex flex-col gap-4 pt-1">
                <div className="flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                  <span>Recommended seniority: <strong className="text-[var(--foreground)]">{careerSuggestions.recommended_seniority || "Not specified"}</strong></span>
                  {careerSuggestions.location_strategy && <span>· {careerSuggestions.location_strategy}</span>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {careerSuggestions.suggested_roles.map((role, idx) => (
                    <article key={role.title} className="subtle-panel flex flex-col gap-1.5 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm">{role.title}</p>
                        {idx === 0 && <span className="tool-badge tool-badge-success shrink-0" style={{ fontSize: "0.6rem" }}>TOP</span>}
                      </div>
                      <p className="text-sm text-[var(--muted)]">{role.why_fit}</p>
                      <p className="text-xs text-[var(--muted)]">{role.target_industries.join(" · ")} · {role.seniority}</p>
                      <button
                        className="btn btn-secondary mt-1 text-xs w-fit"
                        type="button"
                        onClick={() => setTargetRole(role.title)}
                      >
                        Set as Target Role
                      </button>
                    </article>
                  ))}
                </div>
                <ListBlock title="Positioning Advice" items={careerSuggestions.positioning_advice} />
                <ActionBar>
                  <button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Career matches", careerSuggestions.suggested_roles.map((r) => `${r.title}: ${r.why_fit}`).join("\n"))}>
                    Copy Career Matches
                  </button>
                  <button className="btn btn-primary text-sm" type="button" onClick={runProfileGeneration} disabled={loading}>
                    Generate Profile →
                  </button>
                </ActionBar>
              </div>
            )}
            {activeTab === "career" && !careerSuggestions && (
              <div className="tool-empty">
                <p className="font-medium">Run Steps 1+2 first</p>
                <p className="text-xs">Career matching runs automatically after resume analysis.</p>
              </div>
            )}

            {/* ── Profile edit tab ─────────────────────────────── */}
            {activeTab === "profile" && profileOutput && (
              <div className="flex flex-col gap-5 pt-1">
                <ActionBar>
                  <button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Profile package", buildProfileText(profileOutput))}>Copy All</button>
                  <button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Headlines", profileOutput.headlines.join("\n"))}>Copy Headlines</button>
                  <button className="btn btn-primary text-sm" type="button" onClick={saveDraftToDocuments} disabled={loading}>Save Draft →</button>
                </ActionBar>

                {/* Headlines + Skills */}
                <div>
                  <p className="tool-kicker mb-3">CORE SECTIONS</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <EditListArea label="Headline Options" value={profileOutput.headlines} onChange={(headlines) => setProfileOutput((c) => c ? { ...c, headlines } : c)} rows={6} />
                    <EditListArea label="Skills" value={profileOutput.skills} onChange={(skills) => setProfileOutput((c) => c ? { ...c, skills } : c)} rows={6} />
                  </div>
                </div>

                {/* About Versions */}
                <div>
                  <p className="tool-kicker mb-3">ABOUT VERSIONS</p>
                  <div className="flex flex-col gap-3">
                    {profileOutput.about_versions.map((about, idx) => (
                      <label key={`about-${idx}`} className="block space-y-1">
                        <span className="text-sm font-medium">About {idx + 1}</span>
                        <textarea
                          className="input"
                          rows={7}
                          value={about}
                          onChange={(e) => setProfileOutput((c) => c ? { ...c, about_versions: c.about_versions.map((item, i) => i === idx ? e.target.value : item) } : c)}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* Experience */}
                <div>
                  <p className="tool-kicker mb-3">EXPERIENCE</p>
                  <div className="flex flex-col gap-4">
                    {profileOutput.experience.map((entry, idx) => (
                      <article key={`exp-${idx}`} className="subtle-panel flex flex-col gap-3 p-4">
                        <label className="block space-y-1">
                          <span className="text-sm font-medium">Role Title</span>
                          <input className="input" value={entry.title} onChange={(e) => updateExperienceTitle(idx, e.target.value)} />
                        </label>
                        <EditListArea label="Bullets" value={entry.bullets} onChange={(bullets) => updateExperienceBullets(idx, bullets)} rows={6} />
                      </article>
                    ))}
                  </div>
                </div>

                {/* Networking */}
                <div>
                  <p className="tool-kicker mb-3">NETWORKING</p>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <EditListArea label="Connection Targets" value={profileOutput.networking_guidance.connection_targets} onChange={(v) => setProfileOutput((c) => c ? { ...c, networking_guidance: { ...c.networking_guidance, connection_targets: v } } : c)} rows={5} />
                    <EditListArea label="Outreach Messages" value={profileOutput.networking_guidance.outreach_messages} onChange={(v) => setProfileOutput((c) => c ? { ...c, networking_guidance: { ...c.networking_guidance, outreach_messages: v } } : c)} rows={5} />
                    <EditListArea label="Activation Plan" value={profileOutput.networking_guidance.activation_plan} onChange={(v) => setProfileOutput((c) => c ? { ...c, networking_guidance: { ...c.networking_guidance, activation_plan: v } } : c)} rows={5} />
                  </div>
                </div>
              </div>
            )}
            {activeTab === "profile" && !profileOutput && (
              <div className="tool-empty">
                <p className="font-medium">Generate a profile first</p>
                <p className="text-xs">Set your target role and industry in Step 3, then click Generate.</p>
              </div>
            )}

            {/* ── Score tab ────────────────────────────────────── */}
            {activeTab === "score" && profileScore && (
              <div className="flex flex-col gap-5 pt-1">
                <div className="flex items-center gap-6">
                  <ScoreRing score={profileScore.overall_score} size={100} />
                  <div>
                    <p className="font-bold text-lg">{profileScore.overall_score}/100</p>
                    <p className="text-sm text-[var(--muted)] mt-1 max-w-xs leading-relaxed">{profileScore.recruiter_readiness}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <ListBlock title="Strengths" items={profileScore.strengths} />
                  <ListBlock title="Improvement Priorities" items={profileScore.improvement_priorities} />
                </div>

                <div className="flex flex-col gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Section Scores</p>
                  {profileScore.section_scores.map((section) => {
                    const pct = Math.round((section.score / section.max_score) * 100);
                    return (
                      <article key={section.section} className="subtle-panel flex flex-col gap-2 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-sm capitalize">{section.section}</p>
                          <span className={`tool-badge ${pct >= 75 ? "tool-badge-success" : pct >= 50 ? "tool-badge-warn" : "tool-badge-error"} shrink-0`} style={{ fontSize: "0.65rem" }}>
                            {section.score}/{section.max_score}
                          </span>
                        </div>
                        {/* mini progress bar */}
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                          <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-sm text-[var(--muted)]">{section.rationale}</p>
                        <ListBlock title="Actions" items={section.actions} />
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
            {activeTab === "score" && !profileScore && (
              <div className="tool-empty">
                <p className="font-medium">Score your draft</p>
                <p className="text-xs">Generate a profile first, then click Score in the workspace summary.</p>
              </div>
            )}

            {/* ── Banner tab ───────────────────────────────────── */}
            {activeTab === "banner" && bannerOutput && (
              <div className="flex flex-col gap-4 pt-1">
                <ActionBar>
                  <button className="btn btn-secondary text-sm" type="button" onClick={() => void copyText("Banner prompt", bannerOutput.banner_prompt)}>Copy Prompt</button>
                  <button className="btn btn-secondary text-sm" type="button" onClick={runBannerImageGeneration} disabled={loading}>Generate Image</button>
                </ActionBar>

                <label className="block space-y-1">
                  <span className="text-sm font-medium">Tone</span>
                  <input className="input" value={tone} onChange={(e) => setTone(e.target.value)} />
                </label>

                <label className="block space-y-1">
                  <span className="text-sm font-medium">Banner Prompt</span>
                  <textarea className="input" rows={7} value={bannerOutput.banner_prompt} onChange={(e) => setBannerOutput((c) => c ? { ...c, banner_prompt: e.target.value } : c)} />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <EditListArea label="Style Notes" value={bannerOutput.style_notes} onChange={(style_notes) => setBannerOutput((c) => c ? { ...c, style_notes } : c)} rows={4} />
                  <EditListArea label="Visual Focus" value={bannerOutput.visual_focus} onChange={(visual_focus) => setBannerOutput((c) => c ? { ...c, visual_focus } : c)} rows={4} />
                </div>

                {bannerImageUrl && (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Generated Banner</p>
                    <Image alt="Generated LinkedIn banner" className="w-full rounded-xl border border-[var(--line)] object-cover" height={512} src={bannerImageUrl} unoptimized width={1536} />
                    <a className="btn btn-secondary text-sm w-fit" href={bannerImageUrl} target="_blank" rel="noopener noreferrer">
                      Open Full Image
                    </a>
                  </div>
                )}
              </div>
            )}
            {activeTab === "banner" && !bannerOutput && (
              <div className="tool-empty">
                <p className="font-medium">Generate banner assets</p>
                <p className="text-xs">Generate a profile first, then click Banner in the workspace summary.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
