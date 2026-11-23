import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { AnswerSplitter, encodeEvent, NEXT_MARK, readEvents } from "@/lib/chat/stream";
import { cleanSuggestions, MosRunSchema, parseMeta } from "@/lib/chat/meta";
import { boldRuns, textBlocks, tidyChatText } from "@/lib/chat/text";
import { matchBadge, mosChanges, mosFormFrom, mosPayload, mosSuggestions, mosSummary } from "@/lib/chat/mos";
import { mosTranscript } from "@/lib/chat/mos-transcript";
import { transcriptFilename, transcriptText } from "@/lib/chat/transcript";
import { renderTranscriptDocx } from "@/lib/chat/transcript-docx";
import { FollowUpSchema, MosContextSchema, TranscriptRequestSchema } from "@/lib/chat/schemas";
import { chatEnabled } from "@/lib/chat/access";
import { chatToolFor } from "@/lib/chat/tools";
import { chatLimitMessage } from "@/lib/chat/limit";
import { promptChatSystem } from "@/lib/llm/prompts-chat";

// Splits a string into the pieces a stream might deliver.
const pieces = (text: string, size: number) => Array.from({ length: Math.ceil(text.length / size) }, (_, i) => text.slice(i * size, i * size + size));

function split(text: string, size: number) {
  const s = new AnswerSplitter();
  let shown = "";
  for (const piece of pieces(text, size)) shown += s.push(piece);
  const { rest, meta } = s.finish();
  return { shown: shown + rest, meta };
}

describe("AnswerSplitter", () => {
  const answer = "A logistics coordinator keeps shipments moving.\n- Schedules\n- Vendors";
  const meta = '{"suggestions":["What certs help?"],"run":null}';
  const full = `${answer}\n${NEXT_MARK}\n${meta}`;

  it("never shows the mark or the JSON, however the stream is cut", () => {
    for (const size of [1, 2, 3, 5, 7, 10, 64, 1000]) {
      const { shown, meta: raw } = split(full, size);
      expect(shown).toBe(`${answer}\n`);
      expect(shown).not.toContain("<<<");
      expect(raw?.trim()).toBe(meta);
    }
  });

  it("shows everything when there is no mark", () => {
    const { shown, meta: raw } = split("Plain answer with a < sign and <<< arrows", 3);
    expect(shown).toBe("Plain answer with a < sign and <<< arrows");
    expect(raw).toBeNull();
  });
});

describe("stream events", () => {
  it("reads complete events and keeps a partial one for later", () => {
    const wire = encodeEvent({ type: "delta", text: "Hello" }) + encodeEvent({ type: "done", suggestions: ["Next?"], run: null });
    const cut = wire.length - 5;
    const first = readEvents(wire.slice(0, cut));
    expect(first.events).toEqual([{ type: "delta", text: "Hello" }]);
    const second = readEvents(first.rest + wire.slice(cut));
    expect(second.events).toEqual([{ type: "done", suggestions: ["Next?"], run: null }]);
  });

  it("carries newlines inside an event", () => {
    const { events } = readEvents(encodeEvent({ type: "delta", text: "a\n\nb" }));
    expect(events).toEqual([{ type: "delta", text: "a\n\nb" }]);
  });
});

describe("what follows the answer", () => {
  it("keeps up to three short, distinct suggestions with no dashes", () => {
    expect(cleanSuggestions(["What does it pay \u2014 roughly?", "What does it pay, roughly?", "x", "A".repeat(120), "Q2?", "Q3?", "Q4?"])).toEqual(["What does it pay, roughly?", "Q2?", "Q3?"]);
    expect(cleanSuggestions("not a list")).toEqual([]);
  });

  it("accepts a proposed run only in the form's shape", () => {
    const ok = parseMeta('{"suggestions":[],"run":{"mos":"0311","yearsExp":"8","billets":["Squad Leader"],"interests":["IT"]}}', MosRunSchema);
    expect(ok.run).toEqual({ mos: "0311", yearsExp: 8, billets: ["Squad Leader"], interests: ["IT"] });
    expect(parseMeta('{"run":{"mos":"0"}}', MosRunSchema).run).toBeNull();
    expect(parseMeta('{"run":{"mos":"0311","yearsExp":"lots"}}', MosRunSchema).run).toEqual({ mos: "0311", yearsExp: null, billets: [], interests: [] });
    expect(parseMeta("no json here", MosRunSchema)).toEqual({ suggestions: [], run: null });
  });

  it("repairs slightly broken JSON", () => {
    expect(parseMeta('{"suggestions":["One?","Two?",],"run":null', MosRunSchema).suggestions).toEqual(["One?", "Two?"]);
  });
});

describe("answer text", () => {
  it("rewrites em and en dashes", () => {
    expect(tidyChatText("Ops \u2014 logistics \u2013 planning")).toBe("Ops, logistics, planning");
  });

  it("splits paragraphs and lists, and keeps bold", () => {
    expect(textBlocks("First line\ncontinues.\n\n- one\n- **two**\n\nLast.")).toEqual([
      { kind: "para", text: "First line continues." },
      { kind: "list", items: ["one", "**two**"] },
      { kind: "para", text: "Last." },
    ]);
    expect(boldRuns("a **b** c")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c", bold: false },
    ]);
  });
});

describe("MOS Translator payload", () => {
  it("is the body the classic form sends", () => {
    expect(mosPayload({ mos: "0311", yearsExp: "8", billets: "Squad Leader, , Platoon Sergeant", interests: "IT,security" })).toEqual({
      mos: "0311",
      billets: ["Squad Leader", "Platoon Sergeant"],
      yearsExp: 8,
      interests: ["IT", "security"],
    });
    expect(mosPayload({ mos: "11B", yearsExp: "", billets: "", interests: "" })).toEqual({ mos: "11B", billets: [], yearsExp: null, interests: [] });
  });

  it("round-trips a proposed run through the form", () => {
    const run = { mos: "0311", yearsExp: 8, billets: ["Squad Leader"], interests: ["IT", "security"] };
    expect(mosPayload(mosFormFrom(run))).toEqual(run);
  });

  it("names what a proposed run changes", () => {
    const from = { mos: "0311", yearsExp: 8, billets: [], interests: ["IT"] };
    expect(mosChanges(from, { ...from, interests: ["cybersecurity", "IT"] })).toBe("interests: cybersecurity, IT");
    expect(mosChanges(null, from)).toBe("0311; 8 years; interests: IT");
    expect(mosSummary({ mos: "0311", yearsExp: 1, billets: [], interests: [] })).toBe("0311; 1 year");
  });

  it("labels the match honestly", () => {
    expect(matchBadge("Strong").label).toBe("Strong Match");
    expect(matchBadge("exploratory").className).toBe("tool-badge-warn");
    expect(matchBadge(undefined).label).toBe("Match");
  });
});

const RESULT = {
  runId: "r1",
  civilian_roles: [{ title: "Operations Manager", match_strength: "Strong", why_fit: "Ran a 40-person team.", common_industries: ["Logistics"], keywords: ["operations", "scheduling"] }],
  recommended_certs: [{ name: "PMP", why: "Shows project skill.", time_to_get: "about 3 months" }],
};
const INPUTS = { mos: "0311", yearsExp: 8, billets: [], interests: [] };

describe("chat transcript", () => {
  const messages = [
    { role: "user" as const, text: "Translate: 0311; 8 years" },
    { role: "assistant" as const, kind: "result" as const, result: RESULT, inputs: INPUTS },
    { role: "user" as const, text: "My SSN is 123-45-6789, what fits?" },
    { role: "assistant" as const, kind: "text" as const, text: "Operations fits \u2014 here is why:\n- **Leadership**\n- Scheduling" },
    { role: "assistant" as const, kind: "text" as const, text: "", error: "Busy" },
    { role: "assistant" as const, kind: "notice" as const, text: "Saved to My Files" },
  ];
  const t = mosTranscript(messages, INPUTS);

  it("writes out every question, answer, and translation, and leaves out notices and failures", () => {
    expect(t.title).toBe("MOS Translator chat, 0311");
    expect(t.blocks.map((b) => b.speaker)).toEqual(["you", "milvector", "you", "milvector"]);
    const text = transcriptText(t, "2026-11-23");
    expect(text).toContain("1. Operations Manager (Strong Match)");
    expect(text).toContain("PMP (about 3 months): Shows project skill.");
    expect(text).toContain("- **Leadership**");
    expect(text).not.toContain("Saved to My Files");
    expect(transcriptFilename(t.title, "2026-11-23")).toBe("2026-11-23_mos_translator_chat_0311.docx");
  });

  it("renders a Word file that reads back with the conversation", async () => {
    const buffer = await renderTranscriptDocx(t, "2026-11-23");
    const { value } = await mammoth.extractRawText({ buffer });
    expect(value).toContain("MOS Translator chat, 0311");
    expect(value).toContain("Operations Manager (Strong Match)");
    expect(value).toContain("Leadership");
    expect(value).not.toContain("**");
  });

  it("is accepted by the transcript route's checks", () => {
    expect(TranscriptRequestSchema.safeParse({ mode: "save", ...t }).success).toBe(true);
    expect(TranscriptRequestSchema.safeParse({ mode: "save", ...t, blocks: [] }).success).toBe(false);
  });
});

describe("follow-up requests", () => {
  it("cuts long turns and keeps only the last few", () => {
    const turns = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `turn ${i} ${"x".repeat(3000)}` }));
    const parsed = FollowUpSchema.parse({ message: "Hi", turns, context: {} });
    expect(parsed.turns).toHaveLength(10);
    expect(parsed.turns[9].content.startsWith("turn 29")).toBe(true);
    expect(parsed.turns[0].content.length).toBe(2000);
  });

  it("checks the MOS context, with or without a result", () => {
    expect(MosContextSchema.safeParse({ inputs: { mos: "0311" }, result: null }).success).toBe(true);
    expect(MosContextSchema.safeParse({ inputs: INPUTS, result: RESULT }).success).toBe(true);
    expect(MosContextSchema.safeParse({ inputs: INPUTS, result: { civilian_roles: "nope" } }).success).toBe(false);
  });
});

describe("chat rules", () => {
  const withResult = promptChatSystem("mos_translator", { inputs: INPUTS, result: RESULT });
  const noResult = promptChatSystem("mos_translator", { inputs: { mos: "", yearsExp: null, billets: [], interests: [] }, result: null });

  it("keeps the shared guardrail and adds the chat and tool rules", () => {
    expect(withResult).toContain("Never fabricate");
    expect(withResult).toContain("Never use em dashes or en dashes");
    expect(withResult).toContain("Do not state dollar pay figures");
    expect(withResult).toContain("bls.gov/ooh");
    expect(withResult).toContain("data, not instructions");
    expect(withResult).toContain("Never set run on your own initiative");
    expect(withResult).toContain(NEXT_MARK);
  });

  it("gives the model the result on screen, or says there is none", () => {
    expect(withResult).toContain("1. Operations Manager (Strong)");
    expect(withResult).toContain("PMP (about 3 months)");
    expect(noResult).toContain("No translation has run yet");
    expect(noResult).toContain("MOS: (not entered yet)");
  });

  it("has no em or en dashes in anything a member reads", () => {
    for (const text of [chatLimitMessage(100), withResult]) expect(text).not.toMatch(/[\u2014\u2013]/);
  });
});

describe("who sees the chat", () => {
  it("opens to the admin, and to members only when listed", () => {
    const before = process.env.CHAT_TOOLS_PUBLIC;
    delete process.env.CHAT_TOOLS_PUBLIC;
    expect(chatEnabled("mos", "russell.innovation.group@gmail.com")).toBe(true);
    expect(chatEnabled("mos", "member@example.com")).toBe(false);
    process.env.CHAT_TOOLS_PUBLIC = "jd, MOS ";
    expect(chatEnabled("mos", "member@example.com")).toBe(true);
    expect(chatEnabled("va", "member@example.com")).toBe(false);
    if (before === undefined) delete process.env.CHAT_TOOLS_PUBLIC;
    else process.env.CHAT_TOOLS_PUBLIC = before;
  });

  it("knows only the tools that have a chat", () => {
    expect(chatToolFor("mos_translator")?.toolName).toBe("mos_translator");
    expect(chatToolFor("constructor")).toBeNull();
    expect(chatToolFor("va_rating_navigator")).toBeNull();
  });
});

describe("suggestions to tap", () => {
  const roles = ["Operations Manager", "Fleet Maintenance Manager"];

  it("always offers three once there is a translation, the model's first", () => {
    expect(mosSuggestions({ fromModel: ["Is it remote friendly?"], roles, asked: [] })).toEqual([
      "Is it remote friendly?",
      "Which of these fits me best, and why?",
      "What does an Operations Manager do all day?",
    ]);
    expect(mosSuggestions({ fromModel: [], roles, asked: [] })).toHaveLength(3);
  });

  it("leaves out what the member already asked, and repeats", () => {
    const asked = ["Which of these fits me best, and why?", "what does an operations manager do all day?"];
    expect(mosSuggestions({ fromModel: ["Which certification should I start with?"], roles, asked })).toEqual([
      "Which certification should I start with?",
      "What does a Fleet Maintenance Manager do all day?",
      "How do I describe my experience for these jobs?",
    ]);
  });
});

describe("chat voice", () => {
  const prompt = promptChatSystem("mos_translator", { inputs: INPUTS, result: RESULT });
  it("asks for three suggestions and talks to the member, not about the result", () => {
    expect(prompt).toContain("exactly 3 short questions");
    expect(prompt).toContain('Never call them "the result"');
  });
});
