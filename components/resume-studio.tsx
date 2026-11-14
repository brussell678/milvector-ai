"use client";

import { useEffect, useState } from "react";
import { LoadingBlock } from "@/components/tools/loading-block";
import { ToolAlert } from "@/components/tools/tool-alert";
import type { Extraction, FitMap, TargetedResume } from "@/lib/resume/build";
import type { Finding } from "@/lib/resume/gates";
import type { EvidenceRecord } from "@/lib/resume/record";

// ─── Types ────────────────────────────────────────────────────────────

type BatchDoc = { id: string; filename: string; docType: string; chars: number; truncated: boolean };
type Plan = {
  documents: number;
  batches: BatchDoc[][];
  latestRecord: { artifactId: string; title: string; createdAt: string; record: EvidenceRecord } | null;
};
type Generated = { artifactId: string; documentId: string; fileName: string; resume: TargetedResume; findings: Finding[]; gateSummary: { pass: number; warn: number; fail: number } };

const FRIENDLY_ERROR = "Something went wrong on our end. Your work is still here. Try again in a few seconds.";

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: typeof data.error === "string" ? data.error : FRIENDLY_ERROR, data };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "That didn't go through. Check your connection and try again." };
  }
}

// ─── Pieces ───────────────────────────────────────────────────────────

const ASSESSMENT: Record<string, { label: string; badge: string }> = {
  strong: { label: "Strong", badge: "tool-badge-success" },
  met: { label: "Met", badge: "tool-badge-success" },
  partial: { label: "Partial", badge: "tool-badge-warn" },
  gap: { label: "Gap", badge: "tool-badge-error" },
};

const LEVEL: Record<string, { label: string; badge: string }> = {
  pass: { label: "Pass", badge: "tool-badge-success" },
  warn: { label: "Fixed", badge: "tool-badge-warn" },
  fail: { label: "Needs you", badge: "tool-badge-error" },
};

const RECOMMENDATION: Record<string, string> = { apply: "Apply", stretch: "A stretch worth weighing", pass: "Probably not this one" };

function RecordView({ record }: { record: EvidenceRecord }) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            [record.roles.length, "Roles"],
            [record.stats.accomplishments - record.stats.heldForReview, "Verified accomplishments"],
            [record.credentials.length, "Credentials"],
            [`${record.stats.documentsRead} of ${record.stats.documentsAvailable}`, "Documents read"],
          ] as [number | string, string][]
        ).map(([value, label]) => (
          <div key={label} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
            <p className="text-xl font-extrabold">{value}</p>
            <p className="text-xs text-[var(--muted)]">{label}</p>
          </div>
        ))}
      </div>

      {record.stats.heldForReview > 0 && (
        <ToolAlert variant="warn" title={`${record.stats.heldForReview} accomplishment(s) held back`}>
          <p className="text-sm">
            These contain a figure that could not be found in your documents, so they will not be used in a resume. They are marked
            below. If the figure is right, check that the document it came from uploaded clearly.
          </p>
        </ToolAlert>
      )}

      {record.openQuestions.length > 0 && (
        <ToolAlert variant="info" title="Things your records left unclear">
          <ul className="list-disc pl-5 text-sm">
            {record.openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </ToolAlert>
      )}

      {record.roles.map((role) => (
        <details key={role.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          <summary className="cursor-pointer p-3">
            <span className="text-sm font-semibold">{role.title}</span>
            <span className="block text-xs text-[var(--muted)]">
              {role.organization} · {[role.start, role.end].filter(Boolean).join(" - ")} · {role.accomplishments.length} accomplishment(s)
            </span>
          </summary>
          <ul className="grid gap-2 border-t border-[var(--line)] p-3">
            {role.accomplishments.map((acc) => {
              const held = acc.unverifiedNumbers.length > 0;
              return (
                <li key={acc.id} className={`text-sm ${held ? "opacity-70" : ""}`}>
                  <span className="mr-2 font-mono text-[0.68rem] text-[var(--muted)]">{acc.id}</span>
                  {acc.text}
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    From: {acc.sources.map((s) => s.filename).join(", ")}
                    {held ? ` · Held: could not find ${acc.unverifiedNumbers.join(", ")} in the source` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      ))}

      {record.credentials.length > 0 && (
        <details className="rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          <summary className="cursor-pointer p-3 text-sm font-semibold">Education, certifications, and training</summary>
          <ul className="grid gap-1.5 border-t border-[var(--line)] p-3">
            {record.credentials.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="mr-2 font-mono text-[0.68rem] text-[var(--muted)]">{c.id}</span>
                {c.text} <span className="text-xs text-[var(--muted)]">({c.kind}, from your {c.source})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────

export function ResumeStudio() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [record, setRecord] = useState<EvidenceRecord | null>(null);
  const [recordArtifactId, setRecordArtifactId] = useState<string | null>(null);
  const [building, setBuilding] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);

  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [fitMap, setFitMap] = useState<FitMap | null>(null);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [targeting, setTargeting] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [failedFindings, setFailedFindings] = useState<Finding[]>([]);

  useEffect(() => {
    fetch("/api/tools/resume-studio/record")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : FRIENDLY_ERROR);
        return data as Plan;
      })
      .then((data) => {
        setPlan(data);
        if (data.latestRecord) {
          setRecord(data.latestRecord.record);
          setRecordArtifactId(data.latestRecord.artifactId);
        }
      })
      .catch((e: Error) => setPlanError(e.message));
  }, []);

  async function buildRecord() {
    if (!plan || plan.batches.length === 0) return;
    setBuildError(null);
    const parts: Extraction[] = [];
    let documentsRead = 0;

    // One request per batch, so a long career never has to fit in one call
    // and no document is silently left out.
    for (let i = 0; i < plan.batches.length; i += 1) {
      setBuilding(`Reading your records: batch ${i + 1} of ${plan.batches.length} (${plan.batches[i].length} document${plan.batches[i].length === 1 ? "" : "s"})…`);
      const res = await post<{ extraction: Extraction; documentsRead: number }>("/api/tools/resume-studio/record", {
        stage: "extract",
        documentIds: plan.batches[i].map((d) => d.id),
        batchIndex: i,
      });
      if (!res.ok) {
        setBuildError(`${res.error} Stopped at batch ${i + 1} of ${plan.batches.length}; nothing was saved.`);
        setBuilding(null);
        return;
      }
      parts.push(res.data.extraction);
      documentsRead += res.data.documentsRead;
    }

    setBuilding("Organizing your career record and translating it into civilian language…");
    const extraction: Extraction = {
      roles: parts.flatMap((p) => p.roles),
      accomplishments: parts.flatMap((p) => p.accomplishments),
      credentials: parts.flatMap((p) => p.credentials),
      questions: [...new Set(parts.flatMap((p) => p.questions))],
    };
    const res = await post<{ artifactId: string; record: EvidenceRecord }>("/api/tools/resume-studio/record", {
      stage: "consolidate",
      extraction,
      documentsRead,
      documentsAvailable: plan.documents,
    });
    setBuilding(null);
    if (!res.ok) {
      setBuildError(res.error);
      return;
    }
    setRecord(res.data.record);
    setRecordArtifactId(res.data.artifactId);
    setFitMap(null);
    setGenerated(null);
  }

  const targetBody = () => ({ recordArtifactId, jobTitle, company: company || null, jobDescriptionText });

  async function runFit() {
    setTargetError(null);
    setFitMap(null);
    setGenerated(null);
    setFailedFindings([]);
    setTargeting("Mapping the posting against your record…");
    const res = await post<{ fitMap: FitMap }>("/api/tools/resume-studio/target", { stage: "fit", ...targetBody() });
    setTargeting(null);
    if (!res.ok) return setTargetError(res.error);
    setFitMap(res.data.fitMap);
  }

  async function runGenerate() {
    setTargetError(null);
    setGenerated(null);
    setFailedFindings([]);
    setTargeting("Writing your resume and checking every line against your record…");
    const res = await post<Generated>("/api/tools/resume-studio/target", { stage: "generate", ...targetBody(), fitMap: fitMap ?? undefined });
    setTargeting(null);
    if (!res.ok) {
      setTargetError(res.error);
      if (Array.isArray(res.data?.findings)) setFailedFindings(res.data.findings as Finding[]);
      return;
    }
    setGenerated(res.data);
  }

  const docCount = plan?.documents ?? 0;
  const truncated = plan?.batches.flat().filter((d) => d.truncated) ?? [];
  const canTarget = !!recordArtifactId && jobTitle.trim().length >= 2 && jobDescriptionText.trim().length >= 100 && !targeting;

  return (
    <div className="flex flex-col gap-6">
      {/* ── STEP 1: RECORD ─────────────────────────────────────── */}
      <section className="tool-output-card">
        <div>
          <p className="tool-kicker">STEP 1: YOUR CAREER RECORD</p>
          <p className="section-title mt-0.5">Every accomplishment, traced to the document it came from</p>
          <p className="section-description">
            MilVector reads all of your uploaded records, pulls out each role and accomplishment, and checks every figure against the
            source. This record is what your resumes are built from.
          </p>
        </div>

        {planError && (
          <ToolAlert variant="error" title="Could not load your records">
            <p className="text-sm">{planError}</p>
          </ToolAlert>
        )}

        {plan && docCount === 0 && (
          <ToolAlert variant="info" title="Upload your records first">
            <p className="text-sm">
              Add FITREPs or evaluations in <a className="underline" href="/app/documents">My Files</a>. Awards, your JST, and your
              VMET add depth.
            </p>
          </ToolAlert>
        )}

        {plan && docCount > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary text-sm" type="button" disabled={!!building} onClick={() => void buildRecord()}>
              {building ? "Building…" : record ? "Rebuild From My Records" : "Build My Career Record"}
            </button>
            <p className="text-sm text-[var(--muted)]">
              {docCount} document{docCount === 1 ? "" : "s"} ready, read in {plan.batches.length} batch{plan.batches.length === 1 ? "" : "es"}.
              {plan.latestRecord && !building ? ` Last built ${new Date(plan.latestRecord.createdAt).toLocaleDateString()}.` : ""}
            </p>
          </div>
        )}

        {truncated.length > 0 && (
          <p className="text-xs text-[var(--warn)]">
            Too long to read in full, so only the first part is used: {truncated.map((d) => d.filename).join(", ")}.
          </p>
        )}

        {building && <LoadingBlock task={building} detail="About 20 to 60 seconds per batch. Keep this page open." />}
        {buildError && (
          <ToolAlert variant="error" title="The record was not built">
            <p className="text-sm">{buildError}</p>
          </ToolAlert>
        )}
        {record && !building && <RecordView record={record} />}
      </section>

      {/* ── STEP 2: TARGET ─────────────────────────────────────── */}
      <section className="tool-output-card">
        <div>
          <p className="tool-kicker">STEP 2: TARGET A JOB</p>
          <p className="section-title mt-0.5">See how you fit, then build the resume</p>
        </div>

        {!record ? (
          <p className="text-sm text-[var(--muted)]">Build your career record above first.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium">Job title</span>
                <input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Fleet Maintenance Manager" />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Company</span>
                <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Optional" />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Full job posting</span>
              <textarea
                className="input min-h-40"
                value={jobDescriptionText}
                onChange={(e) => setJobDescriptionText(e.target.value)}
                placeholder="Paste the whole posting: duties, requirements, and qualifications."
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary text-sm" type="button" disabled={!canTarget} onClick={() => void runFit()}>
                {fitMap ? "Re-check My Fit" : "Check My Fit"}
              </button>
              {fitMap && (
                <button className="btn btn-primary text-sm" type="button" disabled={!canTarget} onClick={() => void runGenerate()}>
                  {generated ? "Rebuild the Resume" : "Build the Resume"}
                </button>
              )}
            </div>
          </>
        )}

        {targeting && <LoadingBlock task={targeting} detail="Usually 20 to 60 seconds." />}
        {targetError && (
          <ToolAlert variant="error" title="Could not finish">
            <p className="text-sm">{targetError}</p>
            {failedFindings.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {failedFindings.filter((f) => f.level !== "pass").map((f, i) => (
                  <li key={i}>{f.detail}</li>
                ))}
              </ul>
            )}
          </ToolAlert>
        )}

        {fitMap && !targeting && (
          <div className="grid gap-3 border-t border-[var(--line)] pt-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Fit map</p>
              <p className="mt-1 text-lg font-bold">{RECOMMENDATION[fitMap.recommendation]}</p>
              <p className="text-sm">{fitMap.reason}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Required: {fitMap.counts.mandatory.strong + fitMap.counts.mandatory.met} covered, {fitMap.counts.mandatory.partial} partial,{" "}
                {fitMap.counts.mandatory.gap} gap. Preferred: {fitMap.counts.preferred.strong + fitMap.counts.preferred.met} covered,{" "}
                {fitMap.counts.preferred.partial} partial, {fitMap.counts.preferred.gap} gap. No percentage score: the counts are the
                honest picture.
              </p>
            </div>
            <ul className="grid gap-2">
              {fitMap.requirements.map((r, i) => {
                const a = ASSESSMENT[r.assessment];
                return (
                  <li key={i} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">
                        {r.requirement}{" "}
                        <span className="text-xs font-normal text-[var(--muted)]">({r.type === "mandatory" ? "required" : "preferred"})</span>
                      </p>
                      <span className={`tool-badge ${a.badge} shrink-0`} style={{ fontSize: "0.62rem" }}>
                        {a.label}
                      </span>
                    </div>
                    {r.evidence.length > 0 && <p className="mt-1 font-mono text-[0.68rem] text-[var(--muted)]">Evidence: {r.evidence.join(", ")}</p>}
                    {r.bridge && <p className="mt-1 text-sm text-[var(--muted)]">{r.bridge}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {generated && !targeting && (
          <div className="grid gap-4 border-t border-[var(--line)] pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Your resume</p>
                <p className="text-sm text-[var(--muted)]">
                  {generated.gateSummary.pass} checks passed, {generated.gateSummary.warn} fixed automatically, {generated.gateSummary.fail} need you.
                  About {generated.resume.estimatedPages.toFixed(1)} page(s).
                </p>
              </div>
              <a className="btn btn-primary text-sm" href={`/api/documents/${generated.documentId}/download`}>
                Download Word File
              </a>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Quality checks</p>
              <ul className="grid gap-1.5">
                {generated.findings.map((f, i) => {
                  const level = LEVEL[f.level];
                  return (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className={`tool-badge ${level.badge} mt-0.5 shrink-0`} style={{ fontSize: "0.62rem" }}>
                        {level.label}
                      </span>
                      <span>
                        <span className="font-semibold">{f.check}.</span> <span className="text-[var(--muted)]">{f.detail}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="tool-resume-preview">
              {generated.resume.targetTitle && <p className="font-bold">{generated.resume.targetTitle}</p>}
              {generated.resume.summary && <p className="mt-2 text-sm">{generated.resume.summary}</p>}
              {generated.resume.skills.length > 0 && <p className="mt-2 text-sm text-[var(--muted)]">{generated.resume.skills.join(" • ")}</p>}
              {generated.resume.experience.map((role) => (
                <div key={role.roleId} className="mt-4">
                  <p className="text-sm font-bold">{role.title}</p>
                  <p className="text-xs italic text-[var(--muted)]">
                    {role.organization} | {role.dates}
                  </p>
                  <ul className="mt-1.5 grid gap-1.5">
                    {role.bullets.map((b, i) => (
                      <li key={i} className="text-sm">
                        • {b.text} <span className="font-mono text-[0.64rem] text-[var(--muted)]">[{b.evidence.join(", ")}]</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {[...generated.resume.education, ...generated.resume.certifications, ...generated.resume.training].length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-bold">Education and professional development</p>
                  <ul className="mt-1 grid gap-1 text-sm">
                    {[...generated.resume.education, ...generated.resume.certifications, ...generated.resume.training].map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <p className="text-xs text-[var(--muted)]">
              The bracketed codes show which accomplishment each bullet came from. They appear here only, not in the Word file.
            </p>

            {generated.resume.gaps.length > 0 && (
              <ToolAlert variant="info" title="Gaps to be ready for">
                <ul className="list-disc pl-5 text-sm">
                  {generated.resume.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </ToolAlert>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
