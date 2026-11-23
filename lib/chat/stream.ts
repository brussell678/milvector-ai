// The follow-up stream, shared by the endpoint and the page. The model writes
// its answer, then a line with NEXT_MARK, then one JSON object with the
// suggested next questions and any proposed run. The endpoint forwards the
// answer as it arrives and keeps everything from the mark on for itself, so a
// member never sees the mark or the JSON.

export const NEXT_MARK = "<<<NEXT>>>";

export type ChatEvent<Run = unknown> =
  | { type: "delta"; text: string }
  | { type: "done"; suggestions: string[]; run: Run | null }
  | { type: "error"; error: string; code?: string };

/**
 * Splits a streamed answer from what follows NEXT_MARK. push() returns the
 * text that is safe to show now: it holds back a tail that could be the start
 * of the mark, so a mark split across two pieces never leaks.
 */
export class AnswerSplitter {
  private held = "";
  private meta: string | null = null;

  push(piece: string): string {
    if (this.meta !== null) {
      this.meta += piece;
      return "";
    }
    const text = this.held + piece;
    const at = text.indexOf(NEXT_MARK);
    if (at >= 0) {
      this.meta = text.slice(at + NEXT_MARK.length);
      this.held = "";
      return text.slice(0, at);
    }
    // Keep back the longest tail that is a start of the mark.
    let keep = 0;
    for (let n = Math.min(NEXT_MARK.length - 1, text.length); n > 0; n--) {
      if (NEXT_MARK.startsWith(text.slice(-n))) {
        keep = n;
        break;
      }
    }
    this.held = text.slice(text.length - keep);
    return text.slice(0, text.length - keep);
  }

  /** The text still held back (never part of the mark) and the raw JSON after the mark. */
  finish(): { rest: string; meta: string | null } {
    const rest = this.meta === null ? this.held : "";
    this.held = "";
    return { rest, meta: this.meta };
  }
}

/** One event in the stream's wire format (server-sent events). */
export function encodeEvent(event: ChatEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Reads complete events out of a buffer of received text. Returns the events
 * and whatever partial event is left for the next read.
 */
export function readEvents(buffer: string): { events: ChatEvent[]; rest: string } {
  const events: ChatEvent[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const data = part
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    try {
      const event = JSON.parse(data) as ChatEvent;
      if (event && typeof event === "object" && typeof event.type === "string") events.push(event);
    } catch {
      // A malformed event is skipped; the next one still arrives.
    }
  }
  return { events, rest };
}
