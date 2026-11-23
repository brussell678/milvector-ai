import { FIT_ASSESSMENT, FIT_TYPE, FIT_VERDICT } from "@/lib/chat/jd";
import { jobHeadline, resumeText, type ResumeResult, type ResumeRun } from "@/lib/chat/resume";
import { textBlocks } from "@/lib/chat/text";
import type { Transcript, TranscriptBlock, TranscriptLine } from "@/lib/chat/transcript";

// The Targeted Resume chat written out for its Word file (3.9): the
// conversation, each fit with its master lines, each resume in full, and how
// every line was marked. Notices and the page's own offers are left out.

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; kind: "text"; text: string; error?: string; local?: boolean }
  | { role: "assistant"; kind: "result"; result: ResumeResult; inputs: ResumeRun }
  | { role: "assistant"; kind: "notice"; text: string };

function answerLines(text: string): TranscriptLine[] {
  return textBlocks(text).flatMap((block): TranscriptLine[] => (block.kind === "para" ? [{ kind: "para", text: block.text }] : block.items.map((item) => ({ kind: "bullet", text: item }))));
}

function resultBlock(result: ResumeResult, run: ResumeRun): TranscriptBlock {
  const job = run.job;
  const headline = job ? jobHeadline(job) : "this job";
  if (result.type === "fit") {
    const { fitMap, cited } = result.fit;
    const lines: TranscriptLine[] = [{ kind: "para", text: `${FIT_VERDICT[fitMap.recommendation] ?? fitMap.recommendation}. ${fitMap.reason}` }];
    for (const r of fitMap.requirements) {
      lines.push({ kind: "bullet", text: `${r.requirement} (${FIT_TYPE[r.type] ?? r.type}): ${FIT_ASSESSMENT[r.assessment] ?? r.assessment}` });
      for (const id of r.evidence) if (cited[id]) lines.push({ kind: "para", text: `From your master: ${cited[id]}` });
      if (r.bridge) lines.push({ kind: "para", text: r.bridge });
    }
    return { speaker: "milvector", heading: `Your fit for ${headline}${result.fromDecoder ? " (from the JD Decoder)" : ""}`, lines };
  }
  const { built, review } = result;
  const lines: TranscriptLine[] = [
    { kind: "para", text: `${built.gateSummary.pass} checks passed, ${built.gateSummary.warn} fixed automatically, ${built.gateSummary.fail} need you. About ${built.resume.estimatedPages.toFixed(1)} pages.` },
    { kind: "label", text: "The resume" },
    ...resumeText(built.resume)
      .split("\n")
      .filter((line) => line.trim())
      .map((line): TranscriptLine => (line.startsWith("- ") ? { kind: "bullet", text: line.slice(2) } : { kind: "para", text: line })),
  ];
  if (built.figures.length) {
    lines.push({ kind: "label", text: "Lines you checked" });
    built.figures.forEach((f, i) => {
      const mark = review[i];
      lines.push({ kind: "bullet", text: `${f.text} (${mark ? (mark.status === "correct" ? "marked correct" : (mark.note ?? "fixed")) : "not checked yet"})` });
    });
  }
  if (built.resume.gaps.length) {
    lines.push({ kind: "label", text: "Gaps to be ready for" });
    for (const gap of built.resume.gaps) lines.push({ kind: "bullet", text: gap });
  }
  lines.push({ kind: "para", text: `Saved to My Files as ${built.fileName}.` });
  return { speaker: "milvector", heading: `Your resume for ${headline}`, lines };
}

export function resumeTranscript(messages: Message[]): Transcript {
  const blocks: TranscriptBlock[] = [];
  let headline = "";
  for (const m of messages) {
    if (m.role === "user") {
      const text = m.text.length > 600 ? `(A job posting, ${m.text.length.toLocaleString("en-US")} characters)` : m.text;
      if (text.trim()) blocks.push({ speaker: "you", lines: [{ kind: "para", text }] });
    } else if (m.kind === "text") {
      if (!m.error && !m.local && m.text.trim()) blocks.push({ speaker: "milvector", lines: answerLines(m.text) });
    } else if (m.kind === "result") {
      blocks.push(resultBlock(m.result, m.inputs));
      if (m.inputs.job) headline = jobHeadline(m.inputs.job);
    }
  }
  return { title: headline ? `Targeted Resume chat, ${headline}` : "Targeted Resume chat", inputs: "", blocks };
}
