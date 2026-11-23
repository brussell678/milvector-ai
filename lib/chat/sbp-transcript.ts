import { figureLines } from "@/lib/chat/sbp";
import { textBlocks } from "@/lib/chat/text";
import type { Transcript, TranscriptBlock, TranscriptLine } from "@/lib/chat/transcript";
import { sbpAlternativesText } from "@/lib/chat/sbp-text";
import type { SbpForm, SbpResult } from "@/lib/sbp/inputs";
import type { SbpAnalysis } from "@/lib/sbp/math";

// The SBP chat written out for its Word file. Download only: MilVector never
// keeps it (D10). It holds the figures for each comparison and what-if, each
// written assessment, the quick answers, and the conversation.

export type SbpChatResult = { type: "compare"; form: SbpForm; result: SbpResult } | { type: "whatif"; form: SbpForm; label: string; analysis: SbpAnalysis };

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; kind: "text"; text: string; error?: string; local?: boolean }
  | { role: "assistant"; kind: "result"; result: SbpChatResult }
  | { role: "assistant"; kind: "notice"; text: string };

const bullets = (title: string, items: string[]): TranscriptLine[] => (items.length ? [{ kind: "label", text: title }, ...items.map((text) => ({ kind: "bullet" as const, text }))] : []);

function resultBlock(r: SbpChatResult): TranscriptBlock {
  if (r.type === "whatif") {
    return { speaker: "milvector", heading: `What if: ${r.label}`, lines: figureLines(r.analysis).map((text) => ({ kind: "bullet" as const, text })) };
  }
  const { analysis, assessment, assessmentError } = r.result;
  const lines: TranscriptLine[] = [{ kind: "label", text: "The numbers (monthly, in today's dollars)" }, ...figureLines(analysis).map((text) => ({ kind: "bullet" as const, text }))];
  if (assessment) {
    lines.push(
      { kind: "label", text: `Assessment: ${assessment.best_fit_option}` },
      { kind: "para", text: assessment.snapshot },
      ...bullets("This is provisional", assessment.missing_information),
      ...bullets("Why it fits", assessment.why_it_fits),
      ...bullets("What could make this wrong", assessment.main_risks),
      ...bullets("Alternatives", sbpAlternativesText(assessment)),
      ...bullets("What to do next", assessment.next_steps),
    );
  } else {
    lines.push({ kind: "para", text: `The written assessment did not generate: ${assessmentError ?? "try again"}.` });
  }
  lines.push(...bullets("Not modeled", analysis.notModeled));
  return { speaker: "milvector", heading: "Your SBP options", lines };
}

export function sbpTranscript(messages: Message[]): Transcript {
  const blocks: TranscriptBlock[] = [
    {
      speaker: "milvector",
      lines: [
        { kind: "para", text: "Educational guidance, not legal, tax, or financial advice. MilVector sells nothing and earns nothing from your choice. Confirm your election with your installation retirement services office before you sign the DD Form 2656." },
        { kind: "para", text: "MilVector did not keep this file or anything in it. It was written for you to keep." },
      ],
    },
  ];
  for (const m of messages) {
    if (m.role === "user") {
      if (m.text.trim()) blocks.push({ speaker: "you", lines: [{ kind: "para", text: m.text }] });
    } else if (m.kind === "text") {
      if (!m.error && !m.local && m.text.trim()) blocks.push({ speaker: "milvector", lines: textBlocks(m.text).flatMap((b): TranscriptLine[] => (b.kind === "para" ? [{ kind: "para", text: b.text }] : b.items.map((text) => ({ kind: "bullet", text })))) });
    } else if (m.kind === "result") {
      blocks.push(resultBlock(m.result));
    }
  }
  return { title: "SBP Decision Advisor chat", inputs: "", blocks };
}
