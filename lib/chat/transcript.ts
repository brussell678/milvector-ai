// A chat written out for a Word file (D5): Download renders it and stores
// nothing; Save to My Files stores the same file (docs/CHAT_TOOLS_PLAN.md,
// 1.6). The page turns each message into blocks; the server checks them,
// scrubs SSN and DoD ID numbers, and renders.

export type TranscriptLine = { kind: "para" | "bullet" | "label"; text: string };
export type TranscriptBlock = { speaker: "you" | "milvector"; heading?: string; lines: TranscriptLine[] };
export type Transcript = { title: string; inputs: string; blocks: TranscriptBlock[] };

export const TRANSCRIPT_LIMITS = { blocks: 300, lines: 120, chars: 6000, total: 400_000 } as const;

const SPEAKER = { you: "You", milvector: "MilVector" } as const;

/** The plain text of a transcript: what My Files keeps as the file's text. */
export function transcriptText(t: Transcript, savedOn: string): string {
  const out = [t.title, `Saved ${savedOn}`];
  if (t.inputs.trim()) out.push(`Your inputs: ${t.inputs.trim()}`);
  for (const block of t.blocks) {
    out.push("", `${SPEAKER[block.speaker]}:`);
    if (block.heading) out.push(block.heading);
    for (const line of block.lines) out.push(line.kind === "bullet" ? `- ${line.text}` : line.text);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** "2026-11-23_mos_translator_chat_0311.docx" */
export function transcriptFilename(title: string, savedOn: string): string {
  const slug = title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return `${savedOn}_${slug || "chat"}.docx`;
}

export const SPEAKER_LABEL = SPEAKER;
