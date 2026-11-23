import { FIT_ASSESSMENT, FIT_TYPE, FIT_VERDICT, jdHeadline, NO_MASTER, type JdInput, type JdResult } from "@/lib/chat/jd";
import { textBlocks } from "@/lib/chat/text";
import type { Transcript, TranscriptBlock, TranscriptLine } from "@/lib/chat/transcript";

// The JD Decoder chat written out for its Word file (2.7): what the member
// asked, every answer, and each decode in full, its fit with the master lines
// behind each requirement. Notices and the page's own offers are left out.

type Message =
  | { role: "user"; text: string; action?: boolean }
  | { role: "assistant"; kind: "text"; text: string; error?: string; local?: boolean }
  | { role: "assistant"; kind: "result"; result: JdResult; inputs: JdInput }
  | { role: "assistant"; kind: "notice"; text: string };

function answerLines(text: string): TranscriptLine[] {
  return textBlocks(text).flatMap((block): TranscriptLine[] => (block.kind === "para" ? [{ kind: "para", text: block.text }] : block.items.map((item) => ({ kind: "bullet", text: item }))));
}

const listLines = (title: string, items: string[]): TranscriptLine[] => (items.length ? [{ kind: "label", text: title }, ...items.map((text) => ({ kind: "bullet" as const, text }))] : []);

function decodeBlock(result: JdResult, input: JdInput): TranscriptBlock {
  const lines: TranscriptLine[] = [];
  const level = [result.role_level_guess, result.role_level_confidence ? `${result.role_level_confidence} confidence` : ""].filter(Boolean).join(", ");
  if (level) lines.push({ kind: "para", text: `Level: ${level}.` });
  if (input.link) lines.push({ kind: "para", text: `Read from ${input.link}` });
  if (result.plain_english_summary) lines.push({ kind: "para", text: result.plain_english_summary });
  if (result.role_mission_summary) lines.push({ kind: "para", text: `Mission: ${result.role_mission_summary}` });

  lines.push({ kind: "label", text: "Your fit" });
  if (result.fit) {
    const { fitMap, cited, master } = result.fit;
    lines.push({ kind: "para", text: `${FIT_VERDICT[fitMap.recommendation] ?? fitMap.recommendation}. ${fitMap.reason}` });
    lines.push({ kind: "para", text: `Checked against ${master.name}.` });
    for (const r of fitMap.requirements) {
      lines.push({ kind: "bullet", text: `${r.requirement} (${FIT_TYPE[r.type] ?? r.type}): ${FIT_ASSESSMENT[r.assessment] ?? r.assessment}` });
      for (const id of r.evidence) if (cited[id]) lines.push({ kind: "para", text: `From your master: ${cited[id]}` });
      if (r.bridge) lines.push({ kind: "para", text: r.bridge });
    }
  } else {
    lines.push({ kind: "para", text: result.fitNote && result.fitNote !== NO_MASTER ? result.fitNote : "Not checked: no master resume was chosen." });
  }

  lines.push(
    ...listLines("Top must-haves", result.top_must_have_signals),
    ...listLines("Hard requirements", result.hard_requirements),
    ...listLines("Soft requirements", result.soft_requirements),
    ...listLines("Implied expectations", result.implied_expectations),
    ...listLines("Risks to weigh", result.fit_risks),
    ...listLines("Keywords by priority", result.ats_keywords_priority.length ? [result.ats_keywords_priority.join(", ")] : []),
    ...listLines("About the company", result.company_context_signals),
    ...listLines("Interview focus areas", result.interview_focus_areas),
    ...listLines("Likely interview questions", result.likely_interview_questions),
    ...listLines("Questions to ask them", result.clarifying_questions),
  );
  return { speaker: "milvector", heading: `Decoded: ${jdHeadline(result, input)}`, lines };
}

export function jdTranscript(messages: Message[], last: { result: JdResult; input: JdInput } | null): Transcript {
  const blocks: TranscriptBlock[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      // A whole posting pasted into the chat is shown by its size, not in full.
      const text = m.text.length > 600 ? `(A job posting, ${m.text.length.toLocaleString("en-US")} characters)` : m.text;
      if (text.trim()) blocks.push({ speaker: "you", lines: [{ kind: "para", text }] });
    } else if (m.kind === "text") {
      if (!m.error && !m.local && m.text.trim()) blocks.push({ speaker: "milvector", lines: answerLines(m.text) });
    } else if (m.kind === "result") {
      blocks.push(decodeBlock(m.result, m.inputs));
    }
  }
  const headline = last ? jdHeadline(last.result, last.input) : "";
  return { title: headline ? `Job Description Decoder chat, ${headline}` : "Job Description Decoder chat", inputs: "", blocks };
}
