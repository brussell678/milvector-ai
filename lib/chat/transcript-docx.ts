import { Document, Packer, Paragraph, TextRun } from "docx";
import { boldRuns } from "@/lib/chat/text";
import { SPEAKER_LABEL, type Transcript } from "@/lib/chat/transcript";

// The Word file for a chat (D5), in the same Aptos type as MilVector's resumes.

const SIZE = { title: 32, meta: 18, label: 18, body: 21 } as const;
const MUTED = "5B6960";
const ACCENT = "0F6D53";

// **bold** runs in a line become bold; allBold makes the whole line bold.
function runs(text: string, allBold = false) {
  return boldRuns(text).map((run) => new TextRun({ text: run.text, bold: allBold || run.bold, font: "Aptos", size: SIZE.body }));
}

export async function renderTranscriptDocx(t: Transcript, savedOn: string): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: t.title, bold: true, font: "Aptos", size: SIZE.title })], spacing: { after: 60 } }),
    new Paragraph({ children: [new TextRun({ text: `Saved ${savedOn} from MilVector`, font: "Aptos", size: SIZE.meta, color: MUTED })], spacing: { after: t.inputs ? 40 : 240 } }),
  ];
  if (t.inputs.trim()) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Your inputs: ", bold: true, font: "Aptos", size: SIZE.meta, color: MUTED }), new TextRun({ text: t.inputs.trim(), font: "Aptos", size: SIZE.meta, color: MUTED })],
        spacing: { after: 240 },
      }),
    );
  }

  for (const block of t.blocks) {
    const you = block.speaker === "you";
    children.push(
      new Paragraph({
        children: [new TextRun({ text: SPEAKER_LABEL[block.speaker].toUpperCase(), bold: true, font: "Aptos", size: SIZE.label, color: you ? MUTED : ACCENT })],
        spacing: { before: 160, after: 40 },
        keepNext: true,
      }),
    );
    if (block.heading) children.push(new Paragraph({ children: runs(block.heading, true), spacing: { after: 40 }, keepNext: true }));
    for (const line of block.lines) {
      if (line.kind === "bullet") {
        children.push(new Paragraph({ children: [new TextRun({ text: "• ", font: "Aptos", size: SIZE.body }), ...runs(line.text)], indent: { left: 300, hanging: 180 }, spacing: { after: 40 } }));
      } else if (line.kind === "label") {
        children.push(new Paragraph({ children: runs(line.text, true), spacing: { before: 100, after: 20 }, keepNext: true }));
      } else {
        children.push(new Paragraph({ children: runs(line.text), spacing: { after: 80 } }));
      }
    }
  }

  const doc = new Document({
    creator: "MilVector",
    title: t.title,
    styles: { default: { document: { run: { font: "Aptos", size: SIZE.body }, paragraph: { spacing: { line: 264, after: 0 } } } } },
    sections: [{ properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } }, children }],
  });
  return Packer.toBuffer(doc);
}
