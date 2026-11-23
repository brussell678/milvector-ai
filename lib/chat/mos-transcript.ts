import { textBlocks } from "@/lib/chat/text";
import { matchBadge, mosSummary, type MosPayload, type MosResult } from "@/lib/chat/mos";
import type { Transcript, TranscriptBlock, TranscriptLine } from "@/lib/chat/transcript";

// The MOS Translator chat written out for its Word file: what the member
// asked, every answer, and each translation in full. Notices (saved, stopped,
// errors) are left out.

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; kind: "text"; text: string; error?: string }
  | { role: "assistant"; kind: "result"; result: MosResult; inputs: MosPayload }
  | { role: "assistant"; kind: "notice"; text: string };

function answerLines(text: string): TranscriptLine[] {
  return textBlocks(text).flatMap((block): TranscriptLine[] => (block.kind === "para" ? [{ kind: "para", text: block.text }] : block.items.map((item) => ({ kind: "bullet", text: item }))));
}

function resultBlock(result: MosResult, inputs: MosPayload): TranscriptBlock {
  const lines: TranscriptLine[] = [{ kind: "para", text: `Translated: ${mosSummary(inputs)}.` }];
  result.civilian_roles.forEach((role, i) => {
    lines.push({ kind: "label", text: `${i + 1}. ${role.title} (${matchBadge(role.match_strength).label})` });
    if (role.why_fit) lines.push({ kind: "para", text: role.why_fit });
    if (role.common_industries.length) lines.push({ kind: "bullet", text: `Industries: ${role.common_industries.join(", ")}` });
    if (role.keywords.length) lines.push({ kind: "bullet", text: `Keywords: ${role.keywords.join(", ")}` });
  });
  if (result.recommended_certs.length) {
    lines.push({ kind: "label", text: "Certifications worth getting" });
    for (const cert of result.recommended_certs) lines.push({ kind: "bullet", text: `${cert.name} (${cert.time_to_get}): ${cert.why}` });
  }
  return { speaker: "milvector", heading: "Civilian jobs that fit, best first", lines };
}

export function mosTranscript(messages: Message[], lastInputs: MosPayload | null): Transcript {
  const blocks: TranscriptBlock[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      if (m.text.trim()) blocks.push({ speaker: "you", lines: [{ kind: "para", text: m.text }] });
    } else if (m.kind === "text") {
      if (!m.error && m.text.trim()) blocks.push({ speaker: "milvector", lines: answerLines(m.text) });
    } else if (m.kind === "result") {
      blocks.push(resultBlock(m.result, m.inputs));
    }
  }
  const mos = lastInputs?.mos.trim();
  return { title: mos ? `MOS Translator chat, ${mos}` : "MOS Translator chat", inputs: lastInputs ? mosSummary(lastInputs) : "", blocks };
}
