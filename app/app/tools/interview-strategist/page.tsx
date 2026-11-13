"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { LoadingBlock } from "@/components/tools/loading-block";
import { StageBar } from "@/components/tools/stage-bar";
import { ToolAlert } from "@/components/tools/tool-alert";

// ─── Types ────────────────────────────────────────────────────────────

type Artifact = { id: string; title: string; artifact_type: string; created_at: string };

type Prepare = {
  role_analysis: {
    what_the_hiring_manager_cares_about?: string[];
    top_competencies?: string[];
    likely_interview_format?: string;
    likely_tone?: string;
  };
  resume_read?: { strongest_evidence?: string[]; gaps_or_vague_areas?: string[] };
  clarifying_questions?: { id: string; question: string; why_it_matters: string }[];
};

type Package = {
  battle_card?: {
    top_three_interviewer_priorities?: string[];
    strongest_selling_points?: string[];
    biggest_risk?: string;
    risk_mitigation?: string;
    lead_story?: string;
    questions_to_ask?: string[];
  };
  attire?: { rank: number; presentation: string; outfit: string; why: string }[];
  elevator_pitch?: string;
  likely_questions?: { question: string; type: string; why_they_ask: string; strong_answer: string; experience_to_lean_on: string }[];
  risk_areas?: { concern: string; how_to_handle: string }[];
  interview_style?: { format?: string; tone?: string; basis?: string };
  first_five_minutes?: string[];
  things_to_research?: string[];
};

type Turn = { role: "interviewer" | "candidate"; text: string };
type Feedback = { what_worked?: string; what_to_fix?: string; stronger_version?: string };
type Review = {
  scores?: Record<string, number>;
  summary?: string;
  top_three_improvements?: string[];
  revised_answers?: { question: string; revised_answer: string }[];
};

// Browser speech recognition is not in the standard DOM typings.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.98;
  window.speechSynthesis.speak(utterance);
}

// ─── Small pieces ─────────────────────────────────────────────────────

function Bullets({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, idx) => (
          <li key={idx} className="flex gap-2 text-sm">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Labeled({ title, text }: { title: string; text?: string }) {
  if (!text) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{title}</p>
      <p className="text-sm leading-relaxed">{text}</p>
    </div>
  );
}

const SCORE_LABELS: Record<string, string> = {
  confidence: "Confidence",
  clarity: "Clarity",
  leadership_presence: "Leadership presence",
  relevance_to_role: "Relevance to the role",
  overall_readiness: "Overall readiness",
};

// ─── Page ─────────────────────────────────────────────────────────────

export default function InterviewStrategistPage() {
  // Setup
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [resumeChoice, setResumeChoice] = useState("auto");
  const [pastedResumeText, setPastedResumeText] = useState("");
  const [attirePreference, setAttirePreference] = useState("all");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  // Results
  const [prepare, setPrepare] = useState<Prepare | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pkg, setPkg] = useState<Package | null>(null);

  // Mock interview
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [feedbacks, setFeedbacks] = useState<Record<number, Feedback>>({});
  const [draft, setDraft] = useState("");
  const [mockActive, setMockActive] = useState(false);
  const [mockDone, setMockDone] = useState(false);
  const [progress, setProgress] = useState<{ n: number; total: number } | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [readAloud, setReadAloud] = useState(true);
  const [listening, setListening] = useState(false);
  // Only read inside the mock interview, which never renders before hydration.
  const [canListen] = useState(() => getRecognition() !== null);
  const recognitionRef = useRef<Recognition | null>(null);

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/resume-artifacts")
      .then((r) => (r.ok ? r.json() : { artifacts: [] }))
      .then((data: { artifacts?: Artifact[] }) => setArtifacts(data.artifacts ?? []))
      .catch(() => {});
    return () => {
      recognitionRef.current?.stop();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  function resumePayload() {
    if (resumeChoice === "paste") return { pastedResumeText };
    if (resumeChoice.startsWith("artifact:")) return { resumeArtifactId: resumeChoice.slice(9) };
    return {};
  }

  async function call<T>(body: Record<string, unknown>, task: string): Promise<T | null> {
    setLoading(task);
    setError(null);
    try {
      const res = await fetch("/api/tools/interview-strategist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle, company: company || null, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Something went wrong on our end. Your work is still here. Try again in a few seconds.");
        return null;
      }
      return data as T;
    } catch {
      setError("That didn't go through. Check your connection and try again. Your work is still here.");
      return null;
    } finally {
      setLoading(null);
    }
  }

  async function runPrepare(e: FormEvent) {
    e.preventDefault();
    setPrepare(null);
    setPkg(null);
    setTranscript([]);
    setReview(null);
    setMockActive(false);
    const data = await call<Prepare>({ stage: "prepare", jobDescriptionText, ...resumePayload() }, "Reading the posting and your resume…");
    if (data) {
      setPrepare(data);
      setAnswers({});
    }
  }

  async function runPackage() {
    if (!prepare) return;
    const data = await call<{ package: Package }>(
      {
        stage: "package",
        jobDescriptionText,
        ...resumePayload(),
        roleAnalysis: prepare.role_analysis ?? {},
        answers: (prepare.clarifying_questions ?? []).map((q) => ({ question: q.question, answer: answers[q.id] ?? "" })),
        attirePreference,
      },
      "Building your interview package…"
    );
    if (data) setPkg(data.package);
  }

  async function mockTurn(nextTranscript: Turn[]) {
    const data = await call<{ feedback: Feedback | null; nextQuestion: string | null; done: boolean; questionNumber: number; totalQuestions: number }>(
      { stage: "mock_turn", briefing: pkg ?? {}, transcript: nextTranscript },
      nextTranscript.length === 0 ? "Your interviewer is getting ready…" : "Listening to your answer…"
    );
    if (!data) return;
    const answeredIndex = nextTranscript.length - 1;
    if (data.feedback && answeredIndex >= 0) setFeedbacks((prev) => ({ ...prev, [answeredIndex]: data.feedback as Feedback }));
    if (data.nextQuestion) {
      setTranscript([...nextTranscript, { role: "interviewer", text: data.nextQuestion }]);
      setProgress({ n: Math.min(data.questionNumber, data.totalQuestions), total: data.totalQuestions });
      if (readAloud) speak(data.nextQuestion);
    } else {
      setTranscript(nextTranscript);
    }
    if (data.done) {
      setMockDone(true);
      const reviewData = await call<{ review: Review }>({ stage: "mock_review", briefing: pkg ?? {}, transcript: nextTranscript }, "Writing your debrief…");
      if (reviewData) setReview(reviewData.review);
    }
  }

  function startMock() {
    setMockActive(true);
    setMockDone(false);
    setTranscript([]);
    setFeedbacks({});
    setReview(null);
    setDraft("");
    void mockTurn([]);
  }

  function submitAnswer() {
    const text = draft.trim();
    if (!text || loading) return;
    recognitionRef.current?.stop();
    const next: Turn[] = [...transcript, { role: "candidate", text }];
    setTranscript(next);
    setDraft("");
    void mockTurn(next);
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Ctor = getRecognition();
    if (!Ctor) return;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let heard = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) heard += event.results[i][0].transcript;
      }
      if (heard) setDraft((prev) => `${prev} ${heard}`.replace(/\s+/g, " ").trimStart());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  const stages = [
    { label: "Job + Resume", state: prepare ? ("complete" as const) : ("active" as const) },
    { label: "Your Answers", state: pkg ? ("complete" as const) : prepare ? ("active" as const) : ("pending" as const) },
    { label: "Prep Package", state: pkg ? ("complete" as const) : ("pending" as const) },
    { label: "Mock Interview", state: review ? ("complete" as const) : mockActive ? ("active" as const) : ("pending" as const) },
  ];

  const questions = prepare?.clarifying_questions ?? [];
  const lastTurn = transcript[transcript.length - 1];
  const awaitingAnswer = mockActive && !mockDone && lastTurn?.role === "interviewer" && !loading;

  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">INTERVIEW STRATEGIST</p>
            <h1 className="page-title">
              Walk into the interview <span className="gradient-text">already rehearsed.</span>
            </h1>
            <p className="page-description">
              Built around one real job and your real resume: what the hiring manager cares about, the questions you will likely
              face, answers in your own experience, then a mock interview with feedback.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">WHAT YOU GET</p>
            <ul className="page-hero-list">
              <li>A one-page battle card for this interview</li>
              <li>Likely questions with strong answers from your record</li>
              <li>A two-minute pitch and what to wear</li>
              <li>A spoken mock interview with an honest debrief</li>
            </ul>
          </aside>
        </div>
      </section>

      <StageBar stages={stages} />

      <div className="tool-shell">
        {/* ── INPUT ─────────────────────────────────────────────── */}
        <div className="tool-input-panel">
          <section className="tool-section">
            <form className="flex flex-col gap-4" onSubmit={runPrepare}>
              <p className="tool-kicker">STEP 1: THE JOB AND YOUR RESUME</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Job title</span>
                  <input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Operations Manager" required />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Company</span>
                  <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Acme Logistics" />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Full job posting</span>
                <textarea
                  className="input min-h-36"
                  value={jobDescriptionText}
                  onChange={(e) => setJobDescriptionText(e.target.value)}
                  placeholder="Paste the whole posting: duties, requirements, and qualifications."
                  required
                  minLength={100}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Resume you are applying with</span>
                <select className="input" value={resumeChoice} onChange={(e) => setResumeChoice(e.target.value)}>
                  <option value="auto">My most recent saved resume</option>
                  {artifacts.map((a) => (
                    <option key={a.id} value={`artifact:${a.id}`}>
                      {a.title} ({new Date(a.created_at).toLocaleDateString()})
                    </option>
                  ))}
                  <option value="paste">Paste a resume</option>
                </select>
              </label>
              {resumeChoice === "paste" && (
                <textarea
                  className="input min-h-32"
                  value={pastedResumeText}
                  onChange={(e) => setPastedResumeText(e.target.value)}
                  placeholder="Paste your resume text."
                  minLength={100}
                  required
                />
              )}
              <label className="block space-y-1">
                <span className="text-sm font-medium">Attire guidance for</span>
                <select className="input" value={attirePreference} onChange={(e) => setAttirePreference(e.target.value)}>
                  <option value="all">Show all options</option>
                  <option value="masculine">Masculine presentation</option>
                  <option value="feminine">Feminine presentation</option>
                  <option value="neutral">Neutral presentation</option>
                </select>
              </label>
              <button className="btn btn-primary w-full sm:w-auto" type="submit" disabled={!!loading}>
                {prepare ? "Start Over With This Job" : "Analyze the Job"}
              </button>
            </form>
          </section>

          {prepare && questions.length > 0 && (
            <section className="tool-section">
              <p className="tool-kicker">STEP 2: A FEW QUESTIONS</p>
              <p className="section-description">
                These fill gaps a real interviewer would probe. Answer what you can in a sentence or two. Skipping one is fine: it
                just gets flagged as a risk instead of guessed at.
              </p>
              {questions.map((q) => (
                <label key={q.id} className="block space-y-1">
                  <span className="text-sm font-medium">{q.question}</span>
                  <span className="block text-xs text-[var(--muted)]">{q.why_it_matters}</span>
                  <textarea
                    className="input min-h-16"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  />
                </label>
              ))}
              <button className="btn btn-primary w-full sm:w-auto" type="button" disabled={!!loading} onClick={() => void runPackage()}>
                {pkg ? "Rebuild My Package" : "Build My Interview Package"}
              </button>
            </section>
          )}
        </div>

        {/* ── OUTPUT ────────────────────────────────────────────── */}
        <div className="tool-output-panel">
          {error && (
            <ToolAlert variant="error" title="Could not finish">
              <p className="text-sm">{error}</p>
            </ToolAlert>
          )}

          {loading && !mockActive && <LoadingBlock task={loading} detail="This usually takes 20 to 60 seconds." />}

          {prepare && !pkg && !loading && (
            <div className="tool-output-card">
              <div>
                <p className="tool-kicker">ROLE READ</p>
                <p className="section-title mt-0.5">What this interview will turn on</p>
              </div>
              <Bullets title="What the hiring manager cares about" items={prepare.role_analysis?.what_the_hiring_manager_cares_about} />
              <Bullets title="Competencies they are screening for" items={prepare.role_analysis?.top_competencies} />
              <Labeled title="Likely format (estimate)" text={[prepare.role_analysis?.likely_interview_format, prepare.role_analysis?.likely_tone].filter(Boolean).join(" ")} />
              <Bullets title="Your strongest evidence" items={prepare.resume_read?.strongest_evidence} />
              <Bullets title="Where your resume is thin for this job" items={prepare.resume_read?.gaps_or_vague_areas} />
              <p className="text-sm text-[var(--muted)]">Answer the questions on the left, then build your package.</p>
            </div>
          )}

          {pkg && !mockActive && !loading && (
            <>
              <div className="tool-output-card">
                <div>
                  <p className="tool-kicker">BATTLE CARD</p>
                  <p className="section-title mt-0.5">
                    {jobTitle}
                    {company ? ` at ${company}` : ""}
                  </p>
                </div>
                <Bullets title="Top 3 things the interviewer cares about" items={pkg.battle_card?.top_three_interviewer_priorities} />
                <Bullets title="Your strongest selling points" items={pkg.battle_card?.strongest_selling_points} />
                <Labeled title="Biggest risk" text={pkg.battle_card?.biggest_risk} />
                <Labeled title="How to handle it" text={pkg.battle_card?.risk_mitigation} />
                <Labeled title="Story to lead with" text={pkg.battle_card?.lead_story} />
                <Bullets title="Questions to ask them" items={pkg.battle_card?.questions_to_ask} />
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary text-sm" type="button" onClick={startMock}>
                    Start Mock Interview
                  </button>
                  <button className="btn btn-secondary text-sm" type="button" onClick={() => window.print()}>
                    Print Package
                  </button>
                </div>
              </div>

              {pkg.elevator_pitch && (
                <div className="tool-output-card">
                  <p className="tool-kicker">TWO-MINUTE PITCH</p>
                  <p className="whitespace-pre-line text-sm leading-relaxed">{pkg.elevator_pitch}</p>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-secondary text-sm" type="button" onClick={() => speak(pkg.elevator_pitch ?? "")}>
                      Hear It Read Aloud
                    </button>
                    <button className="btn btn-secondary text-sm" type="button" onClick={() => void navigator.clipboard.writeText(pkg.elevator_pitch ?? "")}>
                      Copy
                    </button>
                  </div>
                </div>
              )}

              {!!pkg.likely_questions?.length && (
                <div className="tool-output-card">
                  <div>
                    <p className="tool-kicker">LIKELY QUESTIONS</p>
                    <p className="section-description">Examples to prepare for, not predictions. Put the answers in your own words.</p>
                  </div>
                  <div className="grid gap-3">
                    {pkg.likely_questions.map((q, idx) => (
                      <details key={idx} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
                        <summary className="cursor-pointer text-sm font-semibold">
                          {q.question}{" "}
                          {q.type === "difficult" ? (
                            <span className="tool-badge tool-badge-warn ml-1" style={{ fontSize: "0.6rem" }}>
                              Tough one
                            </span>
                          ) : null}
                        </summary>
                        <div className="mt-3 grid gap-3">
                          <Labeled title="Why they ask" text={q.why_they_ask} />
                          <Labeled title="Strong answer" text={q.strong_answer} />
                          <Labeled title="Experience to lean on" text={q.experience_to_lean_on} />
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              <div className="tool-output-card">
                <p className="tool-kicker">DAY OF THE INTERVIEW</p>
                <Labeled
                  title="Likely style (estimate)"
                  text={[pkg.interview_style?.format, pkg.interview_style?.tone, pkg.interview_style?.basis].filter(Boolean).join(" ")}
                />
                <Bullets title="Your first five minutes" items={pkg.first_five_minutes} />
                {!!pkg.attire?.length && (
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">What to wear, best choice first</p>
                    <ol className="grid gap-2">
                      {pkg.attire.map((a, idx) => (
                        <li key={idx} className="text-sm">
                          <span className="font-semibold">
                            {idx + 1}. {a.presentation}:
                          </span>{" "}
                          {a.outfit} <span className="text-[var(--muted)]">{a.why}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {!!pkg.risk_areas?.length && (
                  <Bullets title="Risk areas and how to handle them" items={pkg.risk_areas.map((r) => `${r.concern}: ${r.how_to_handle}`)} />
                )}
                <Bullets title="Look these up before you go" items={pkg.things_to_research} />
                <p className="text-xs text-[var(--muted)]">
                  Company details here come only from the posting you pasted. Check the company&apos;s own site and recent news
                  before the interview.
                </p>
              </div>
            </>
          )}

          {mockActive && (
            <div className="tool-output-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="tool-kicker">MOCK INTERVIEW</p>
                  <p className="section-description">
                    {mockDone ? "Interview complete." : progress ? `Question ${progress.n} of ${progress.total}` : "Starting…"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
                    <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} />
                    Read questions aloud
                  </label>
                  <button className="btn btn-secondary text-sm" type="button" onClick={() => setMockActive(false)}>
                    Back to Package
                  </button>
                </div>
              </div>

              <div className="grid gap-3">
                {transcript.map((turn, idx) => (
                  <div key={idx}>
                    <div
                      className={`rounded-xl border p-3 text-sm ${
                        turn.role === "interviewer"
                          ? "border-[var(--line)] bg-[var(--surface)]"
                          : "ml-6 border-[color-mix(in_oklab,var(--accent)_40%,var(--line)_60%)] bg-[var(--panel)]"
                      }`}
                    >
                      <p className="mb-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                        {turn.role === "interviewer" ? "Interviewer" : "You"}
                      </p>
                      <p className="whitespace-pre-line leading-relaxed">{turn.text}</p>
                      {turn.role === "interviewer" && (
                        <button className="mt-2 text-xs font-semibold text-[var(--accent)] hover:underline" type="button" onClick={() => speak(turn.text)}>
                          Hear it again
                        </button>
                      )}
                    </div>
                    {turn.role === "candidate" && feedbacks[idx] && (
                      <div className="ml-6 mt-2 grid gap-1.5 rounded-xl border border-dashed border-[var(--line)] p-3 text-sm">
                        <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Feedback</p>
                        {feedbacks[idx].what_worked ? (
                          <p>
                            <span className="font-semibold">What worked:</span> {feedbacks[idx].what_worked}
                          </p>
                        ) : null}
                        {feedbacks[idx].what_to_fix ? (
                          <p>
                            <span className="font-semibold">Fix:</span> {feedbacks[idx].what_to_fix}
                          </p>
                        ) : null}
                        {feedbacks[idx].stronger_version ? (
                          <p className="text-[var(--muted)]">
                            <span className="font-semibold">Stronger version:</span> {feedbacks[idx].stronger_version}
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {loading && <LoadingBlock task={loading} />}

              {awaitingAnswer && (
                <div className="grid gap-2">
                  <textarea
                    className="input min-h-28"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={canListen ? "Answer out loud with the microphone button, or type here." : "Type your answer the way you would say it."}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-primary text-sm" type="button" onClick={submitAnswer} disabled={!draft.trim()}>
                      Submit Answer
                    </button>
                    {canListen && (
                      <button className="btn btn-secondary text-sm" type="button" onClick={toggleListening} aria-pressed={listening}>
                        {listening ? "Stop Listening" : "Answer by Voice"}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    {canListen
                      ? "Speaking your answers is the closest thing to the real interview. Your browser turns your voice into text on your device."
                      : "Voice answers need Chrome, Edge, or Safari. You can still hear each question read aloud."}
                  </p>
                </div>
              )}

              {review && (
                <div className="grid gap-4 border-t border-[var(--line)] pt-4">
                  <p className="section-title">Your debrief</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {Object.entries(SCORE_LABELS).map(([key, label]) => (
                      <div key={key} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-center">
                        <p className="text-2xl font-extrabold">{review.scores?.[key] ?? "?"}</p>
                        <p className="text-[0.68rem] text-[var(--muted)]">{label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--muted)]">Scores are out of 10 and reflect this practice session only.</p>
                  <Labeled title="Summary" text={review.summary} />
                  <Bullets title="Top 3 improvements" items={review.top_three_improvements} />
                  {!!review.revised_answers?.length && (
                    <div className="grid gap-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Answers worth reworking</p>
                      {review.revised_answers.map((r, idx) => (
                        <div key={idx} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm">
                          <p className="font-semibold">{r.question}</p>
                          <p className="mt-1 leading-relaxed">{r.revised_answer}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <button className="btn btn-primary w-full text-sm sm:w-auto" type="button" onClick={startMock}>
                    Run It Again
                  </button>
                </div>
              )}
            </div>
          )}

          {!prepare && !loading && !error && (
            <div className="tool-empty">
              <p className="font-medium">Your interview package will appear here</p>
              <p className="text-sm">
                Paste the job posting and pick the resume you applied with. You will get a short set of questions first, so the
                package is built on your real stories and not on guesses.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
