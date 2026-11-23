import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { crisisSignal } from "@/lib/chat/crisis";
import { parseMeta, VaRunSchema } from "@/lib/chat/meta";
import { VaContextSchema } from "@/lib/chat/schemas";
import { chatToolFor } from "@/lib/chat/tools";
import { transcriptFilename, transcriptText } from "@/lib/chat/transcript";
import { renderTranscriptDocx } from "@/lib/chat/transcript-docx";
import { conditionLines, EMPTY_VA_CONTEXT, rowFrom, vaAnalyzeBody, vaCombined, vaContext, vaIdentifyBody, vaSuggestions, type Analysis, type Row } from "@/lib/chat/va";
import { vaTranscript } from "@/lib/chat/va-transcript";
import { promptChatSystem } from "@/lib/llm/prompts-chat";

const DESCRIPTION = "My left knee gives out twice a week and swells after a mile.";

const ANALYSIS: Analysis = {
  condition: "Left knee",
  crisisNote: "",
  codes: [{ code: "5260", title: "Leg, limitation of flexion of", section: "4.71a", why: "" }],
  breakdown: [{ code: "5260", rating: 10, criteria: "Flexion limited to 45 degrees.", evidence: "", examiner: "" }],
  checklist: { form: "Knee and Lower Leg", items: [{ item: "Range of motion", status: "missing" }, { item: "Flare-ups", status: "covered" }] },
  criteriaLanguage: { lower: [], middle: [], higher: [] },
  gaps: { described: ["Swelling after walking a mile"], missing: ["Range of motion measured"], weak: [], strengthen: ["A recent exam note"] },
  likelyRange: { low: 10, high: 20, why: "Pain with some limited motion.", up: "Measured flexion under 30 degrees.", down: "Full motion.", confidence: "low" },
  secondary: [{ condition: "Right hip", relationship: "aggravated", note: "" }],
  examPrep: ["Bring your treatment notes."],
  allowedRatings: [0, 10, 20, 30],
};

const row = (over: Partial<Row>): Row => ({
  ...rowFrom({ input: "Left knee", plainLanguage: "", candidates: [{ code: "5260", title: "Leg, limitation of flexion of", why: "", ratings: [0, 10, 20, 30], limb: "lower" }], dbq: [{ title: "Knee and Lower Leg", url: "https://example.va.gov/knee" }], note: "" }),
  ...over,
});

describe("VA Navigator requests", () => {
  it("are the classic page's bodies", () => {
    expect(vaIdentifyBody(["Tinnitus", "Left knee"])).toEqual({ stage: "identify", conditions: ["Tinnitus", "Left knee"] });
    expect(vaAnalyzeBody(row({ details: DESCRIPTION }))).toEqual({ stage: "analyze", condition: "Left knee", codes: ["5260"], dbqTitles: ["Knee and Lower Leg"], details: DESCRIPTION });
    expect(vaAnalyzeBody(row({ input: "x".repeat(200) })).condition).toHaveLength(160);
    expect(vaAnalyzeBody(row({})).details).toBeNull();
    expect(conditionLines(" Tinnitus \n\nx\nLeft knee")).toEqual(["Tinnitus", "Left knee"]);
  });

  it("is a tool with a chat", () => {
    expect(chatToolFor("va_rating_navigator")?.key).toBe("va");
  });
});

describe("the crisis check (4.5)", () => {
  it("shows the Veterans Crisis Line for words of suicide or self-harm", () => {
    for (const text of ["Sometimes I want to die", "I've thought about killing myself", "PTSD with suicidal ideation", "I don't want to wake up", "thinking of ending it all", "I cut myself last year", "self-harm"]) {
      expect(crisisSignal(text), text).toBe(true);
    }
  });

  it("stays quiet for ordinary claims talk", () => {
    for (const text of ["My back pain is killing me at work", "Left knee gives out", "Does tinnitus go to 10 percent?", "I take sleep medication"]) {
      expect(crisisSignal(text), text).toBe(false);
    }
  });
});

describe("VA chat context", () => {
  const rows = [row({ details: DESCRIPTION, analysis: ANALYSIS, rating: "50" }), { ...row({}), input: "Tinnitus", code: "6260", rating: "30" }];
  const ctx = vaContext(rows, { asOf: "2026-11-01", url: "https://www.ecfr.gov" });

  it("never carries the member's own description", () => {
    expect(JSON.stringify(ctx)).not.toContain("gives out twice a week");
    expect(ctx.conditions[0].analysis?.missing).toEqual(["Range of motion measured"]);
    expect(ctx.conditions[0].analysis?.checklistOpen).toEqual(["Range of motion"]);
  });

  it("carries the combined estimate and its math", () => {
    expect(ctx.combined).toEqual({ rating: 70, value: 65, rated: 2, steps: ["start with 50", "50 combined with 30 is 65", "65 rounds to 70"] });
    expect(vaCombined([{ rating: "", side: "" }])).toBeNull();
    expect(VaContextSchema.safeParse(ctx).success).toBe(true);
    expect(VaContextSchema.safeParse(EMPTY_VA_CONTEXT).success).toBe(true);
  });

  it("takes each code's allowed ratings from the schedule on the server, not from the page", () => {
    // The page says 30 for tinnitus; the schedule allows only 10.
    const prompt = promptChatSystem("va_rating_navigator", ctx);
    expect(prompt).toContain('"Tinnitus": DC 6260 Tinnitus, recurrent (allowed ratings: 10). Rating picked for the estimate: 30.');
    expect(prompt).toContain("DC 5260 Leg, limitation of flexion of (allowed ratings: 0, 10, 20, 30)");
    expect(prompt).toContain("Appears missing: Range of motion measured");
    expect(prompt).toContain("COMBINED ESTIMATE (data): 70 percent");
  });

  it("offers three questions", () => {
    expect(vaSuggestions({ fromModel: [], analyzed: true, analogous: false, asked: [] })).toEqual(["How does VA combine my ratings?", "What evidence would help most?", "What happens at the exam?"]);
  });
});

describe("VA chat rules", () => {
  const prompt = promptChatSystem("va_rating_navigator", EMPTY_VA_CONTEXT);

  it("keeps the navigator's boundaries", () => {
    expect(prompt).toContain("Never tell the member what to say, how to describe a condition, or which symptoms to report to get a higher rating");
    expect(prompt).toContain("never encourage exaggerating");
    expect(prompt).toContain("only if it is among the allowed ratings");
    expect(prompt).toContain("accredited Veterans Service Officer");
    expect(prompt).toContain("call 988 and press 1, or text 838255");
    expect(prompt).toContain("confirm current criteria at the eCFR");
    expect(prompt).toContain("No conditions have been matched yet");
  });

  it("may propose only a lookup of named conditions", () => {
    expect(parseMeta('{"suggestions":[],"run":{"conditions":["Sleep apnea","Tinnitus"]}}', VaRunSchema).run).toEqual({ conditions: ["Sleep apnea", "Tinnitus"] });
    expect(parseMeta('{"run":{"conditions":[]}}', VaRunSchema).run).toBeNull();
    expect(parseMeta('{"run":{"rating":100}}', VaRunSchema).run).toBeNull();
  });
});

describe("VA chat download (D9)", () => {
  const t = vaTranscript([
    { role: "user", text: "Find the rating codes: Left knee", action: true } as never,
    { role: "assistant", kind: "result", result: { type: "conditions", rows: [row({ rating: "10" })], source: { asOf: "2026-11-01", url: "" } } },
    { role: "assistant", kind: "text", text: "Describe this condition in your own words.", local: true },
    { role: "user", text: DESCRIPTION, paste: true },
    { role: "assistant", kind: "result", result: { type: "analysis", listId: "l1", index: 0, condition: "Left knee", code: "5260", analysis: ANALYSIS } },
  ]);
  const text = transcriptText(t, "2026-11-23");

  it("names no condition in its title or file name", () => {
    expect(t.title).toBe("VA Rating Navigator chat");
    expect(transcriptFilename(t.title, "2026-11-23")).toBe("2026-11-23_va_rating_navigator_chat.docx");
  });

  it("writes the conditions, the member's description, and the analysis, and says nothing was kept", () => {
    expect(text).toContain("MilVector did not keep this file");
    expect(text).toContain("- Left knee: DC 5260 Leg, limitation of flexion of; rating picked 10%");
    expect(text).toContain("Your description");
    expect(text).toContain(DESCRIPTION);
    expect(text).toContain("Likely range (estimate): 10 to 20%");
    expect(text).toContain("- Range of motion (not mentioned)");
    expect(text).not.toContain("Describe this condition in your own words.");
  });

  it("renders as a Word file", async () => {
    const { value } = await mammoth.extractRawText({ buffer: await renderTranscriptDocx(t, "2026-11-23") });
    expect(value).toContain("Analysis: Left knee (DC 5260)");
  });
});
