// Text tidying for what the chat shows and saves. MilVector copy never uses
// em or en dashes, and a model answer can, so they are rewritten as commas,
// the same way the business card follow-up drafts are cleaned.

export function tidyChatText(text: string): string {
  return text
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

export type TextBlock = { kind: "para"; text: string } | { kind: "list"; items: string[] };

/**
 * Splits an answer into paragraphs and bullet lists. Lines starting with
 * "- ", "* ", or "1. " are list items; anything else is a paragraph.
 */
export function textBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ kind: "para", text: para.join(" ").trim() });
    para = [];
  };
  const flushList = () => {
    if (list?.length) blocks.push({ kind: "list", items: list });
    list = null;
  };
  for (const raw of tidyChatText(text).split("\n")) {
    const line = raw.trim();
    const item = /^(?:[-*•]|\d{1,2}[.)])\s+(.*)$/.exec(line);
    if (item) {
      flushPara();
      (list ??= []).push(item[1].trim());
    } else if (!line) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks.filter((b) => (b.kind === "para" ? b.text.length > 0 : b.items.length > 0));
}

/** Splits **bold** runs out of a line, for display and for the Word file. */
export function boldRuns(text: string): { text: string; bold: boolean }[] {
  const runs: { text: string; bold: boolean }[] = [];
  const parts = text.split(/\*\*(.+?)\*\*/g);
  parts.forEach((part, i) => {
    if (part) runs.push({ text: part, bold: i % 2 === 1 });
  });
  return runs;
}
