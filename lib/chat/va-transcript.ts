import { textBlocks } from "@/lib/chat/text";
import { DECISION_NOTICE_TITLE, decisionNotice } from "@/lib/legal/decision-notice";
import type { Transcript, TranscriptBlock, TranscriptLine } from "@/lib/chat/transcript";
import { vaCombined, type Analysis, type Row } from "@/lib/chat/va";

// The VA chat written out for its Word file (4.7). Download only: MilVector
// never keeps it (D9). It holds the conditions and their codes, the picked
// ratings and the combined math, each analysis, the member's own
// descriptions, and the conversation. The title names no condition, so the
// file name does not either.

export type VaResult =
  | { type: "conditions"; rows: Row[]; source: { asOf: string; url: string } | null }
  | { type: "analysis"; listId: string; index: number; condition: string; code: string; analysis: Analysis };

type Message =
  | { role: "user"; text: string; paste?: boolean }
  | { role: "assistant"; kind: "text"; text: string; error?: string; local?: boolean }
  | { role: "assistant"; kind: "result"; result: VaResult }
  | { role: "assistant"; kind: "notice"; text: string };

const list = (title: string, items: string[]): TranscriptLine[] => (items.length ? [{ kind: "label", text: title }, ...items.map((text) => ({ kind: "bullet" as const, text }))] : []);

function rangeText(a: Analysis): string {
  const { low, high } = a.likelyRange;
  if (low === null || high === null) return "no estimate";
  return low === high ? `${low}%` : `${low} to ${high}%`;
}

function conditionsBlock(rows: Row[], asOf: string | null): TranscriptBlock {
  const lines: TranscriptLine[] = rows.map((row) => {
    const candidate = row.candidates.find((c) => c.code === row.code);
    const code = candidate ? `${candidate.analogous ? "by analogy, " : ""}DC ${row.code} ${candidate.title}` : "no matching code";
    const picked = row.rating === "" ? "" : `; rating picked ${row.rating}%`;
    return { kind: "bullet", text: `${row.input}: ${code}${picked}` };
  });
  const combined = vaCombined(rows);
  if (combined) {
    lines.push({ kind: "label", text: `Combined estimate: ${combined.combinedRating}% (exact value ${combined.combinedValue}), from ${combined.rated} of ${rows.length} conditions` });
    for (const step of combined.steps) lines.push({ kind: "bullet", text: step });
  }
  if (asOf) lines.push({ kind: "para", text: `Rating criteria from 38 CFR Part 4 as of ${asOf}. Confirm current criteria before relying on this.` });
  return { speaker: "milvector", heading: "Your conditions", lines };
}

function analysisBlock(r: Extract<VaResult, { type: "analysis" }>): TranscriptBlock {
  const a = r.analysis;
  const lines: TranscriptLine[] = [];
  if (a.crisisNote) lines.push({ kind: "para", text: a.crisisNote });
  lines.push({ kind: "para", text: `Likely range (estimate): ${rangeText(a)}. Confidence: ${a.likelyRange.confidence}. Based only on what you described.` });
  if (a.likelyRange.why) lines.push({ kind: "para", text: a.likelyRange.why });
  if (a.likelyRange.up) lines.push({ kind: "para", text: `Could move it up: ${a.likelyRange.up}` });
  if (a.likelyRange.down) lines.push({ kind: "para", text: `Could move it down: ${a.likelyRange.down}` });
  if (a.breakdown.length) {
    lines.push({ kind: "label", text: "Rating criteria, level by level" });
    for (const b of a.breakdown) lines.push({ kind: "bullet", text: `${b.rating} percent: ${b.criteria}` });
  }
  lines.push(
    ...list("What you already described", a.gaps.described),
    ...list("What appears to be missing", a.gaps.missing),
    ...list("Weak points", a.gaps.weak),
    ...list("What would strengthen the record", a.gaps.strengthen),
    ...list(`Exam form checklist${a.checklist.form ? `: ${a.checklist.form}` : ""}`, a.checklist.items.map((i) => `${i.item} (${i.status === "covered" ? "you covered this" : i.status === "missing" ? "not mentioned" : "unclear"})`)),
    ...list("Preparing for the exam", a.examPrep),
    ...list("Possible secondary conditions", a.secondary.map((s) => `${s.condition} (${s.relationship})${s.note ? `: ${s.note}` : ""}`)),
  );
  return { speaker: "milvector", heading: `Analysis: ${r.condition} (DC ${r.code})`, lines };
}

export function vaTranscript(messages: Message[]): Transcript {
  const blocks: TranscriptBlock[] = [
    {
      speaker: "milvector",
      lines: [
        { kind: "label", text: DECISION_NOTICE_TITLE },
        { kind: "para", text: decisionNotice("va") },
        { kind: "para", text: "MilVector is not an accredited claims agent, attorney, or medical provider and does not file or prepare claims." },
        { kind: "para", text: "MilVector did not keep this file or anything in it. It was written for you to keep." },
      ],
    },
  ];
  for (const m of messages) {
    if (m.role === "user") {
      if (m.text.trim()) blocks.push({ speaker: "you", heading: m.paste ? "Your description" : undefined, lines: [{ kind: "para", text: m.text }] });
    } else if (m.kind === "text") {
      if (!m.error && !m.local && m.text.trim()) {
        blocks.push({ speaker: "milvector", lines: textBlocks(m.text).flatMap((b): TranscriptLine[] => (b.kind === "para" ? [{ kind: "para", text: b.text }] : b.items.map((text) => ({ kind: "bullet", text })))) });
      }
    } else if (m.kind === "result") {
      blocks.push(m.result.type === "conditions" ? conditionsBlock(m.result.rows, m.result.source?.asOf ?? null) : analysisBlock(m.result));
    }
  }
  return { title: "VA Rating Navigator chat", inputs: "", blocks };
}
