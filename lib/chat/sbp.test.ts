import { describe, expect, it } from "vitest";
import { applyWhatIf, EMPTY_SBP_CONTEXT, parseAmount, SBP_QUICK_QUESTIONS, sbpIntake, sbpSuggestions, whatIfLabel } from "@/lib/chat/sbp";
import { parseMeta, SbpRunSchema } from "@/lib/chat/meta";
import { SbpContextSchema } from "@/lib/chat/schemas";
import { sbpTranscript } from "@/lib/chat/sbp-transcript";
import { chatToolFor } from "@/lib/chat/tools";
import { transcriptFilename, transcriptText } from "@/lib/chat/transcript";
import { promptChatSystem } from "@/lib/llm/prompts-chat";
import { DEFAULT_SBP_FORM, sbpAnalysisFor, sbpAnalysisForForm, sbpPayload, type SbpForm } from "@/lib/sbp/inputs";
import { analyzeSbp } from "@/lib/sbp/math";

const FORM: SbpForm = { ...DEFAULT_SBP_FORM, memberAge: "42", spouseAge: "40", retiredPay: "4,000", childrenAges: "8, 12", assets: "250000", notes: "My wife is a nurse." };

describe("SBP request", () => {
  it("builds the classic page's body from the form", () => {
    const p = sbpPayload(FORM);
    expect(p).toMatchObject({ maritalStatus: "married", memberAgeAtRetirement: 42, spouseAge: 40, childrenAges: [8, 12], grossRetiredPay: 4000, investableAssets: 250000, marginalTaxRatePct: 22, termQuote: null, notes: "My wife is a nurse." });
    expect(sbpPayload({ ...FORM, childrenAges: "" }).childrenAges).toEqual([]);
    // A term quote counts only when all three parts are there.
    expect(sbpPayload({ ...FORM, termCoverage: "750000", termPremium: "65" }).termQuote).toBeNull();
    expect(sbpPayload({ ...FORM, termCoverage: "750,000", termPremium: "65", termYears: "20" }).termQuote).toEqual({ coverage: 750000, monthlyPremium: 65, termYears: 20 });
  });

  it("works out the same figures the route always did", () => {
    const direct = analyzeSbp({ grossRetiredPay: 4000, baseAmount: 4000, memberAgeAtRetirement: 42, spouseAge: 40, marginalTaxRate: 0.22 }, { reducedBase: null, termQuote: null });
    expect(sbpAnalysisFor({ grossRetiredPay: 4000, memberAgeAtRetirement: 42, spouseAge: 40, marginalTaxRatePct: 22 })).toEqual(direct);
    expect(sbpAnalysisForForm(FORM)).toEqual(direct);
    expect(sbpAnalysisForForm({ ...FORM, retiredPay: "" })).toBeNull();
    expect(direct.full.monthlyPremium).toBe(260);
    expect(direct.full.monthlyAnnuity).toBe(2200);
  });

  it("is a tool with a chat", () => {
    expect(chatToolFor("sbp_advisor")?.key).toBe("sbp");
  });
});

describe("quick questions (D19)", () => {
  it("are mostly one tap, with two typed amounts", () => {
    expect(SBP_QUICK_QUESTIONS.filter((q) => q.options).length).toBe(8);
    expect(SBP_QUICK_QUESTIONS.filter((q) => q.placeholder).map((q) => q.field)).toEqual(["assets", "lifeInsurance"]);
  });

  it("read an amount the way people type it", () => {
    expect(parseAmount("250,000")).toBe(250000);
    expect(parseAmount("$1.2m")).toBe(1200000);
    expect(parseAmount("250k")).toBe(250000);
    expect(parseAmount("about a quarter million")).toBeNull();
  });
});

describe("what-ifs", () => {
  it("apply to the form and recalculate with no AI", () => {
    const next = applyWhatIf(FORM, { reducedBaseAmount: 2000, termQuote: { coverage: 750000, monthlyPremium: 65, termYears: 20 } });
    const a = sbpAnalysisForForm(next)!;
    expect(a.reduced?.baseAmount).toBe(2000);
    expect(a.reduced?.monthlyPremium).toBe(130);
    expect(a.term?.coverage).toBe(750000);
    expect(whatIfLabel({ reducedBaseAmount: 2000 })).toBe("covered amount $2,000 a month");
  });

  it("from the model only in the changed-values shape", () => {
    expect(parseMeta('{"run":{"reducedBaseAmount":"2000"}}', SbpRunSchema).run).toEqual({ reducedBaseAmount: 2000 });
    expect(parseMeta('{"run":{}}', SbpRunSchema).run).toBeNull();
    expect(parseMeta('{"run":{"termQuote":{"coverage":500000}}}', SbpRunSchema).run).toBeNull();
    expect(parseMeta('{"run":{"recommend":"full"}}', SbpRunSchema).run).toBeNull();
  });
});

describe("SBP chat context and rules", () => {
  const intake = sbpIntake(FORM);

  it("leaves the free-text notes out of every follow-up", () => {
    expect(JSON.stringify(intake)).not.toContain("nurse");
    expect(SbpContextSchema.safeParse({ intake, assessment: null, whatIf: null, whatIfLabel: null }).success).toBe(true);
    expect(SbpContextSchema.safeParse(EMPTY_SBP_CONTEXT).success).toBe(true);
    expect(SbpContextSchema.safeParse({ intake: { ...intake, grossRetiredPay: 5 } }).success).toBe(false);
  });

  it("gives the model figures worked out on the server, and the rules", () => {
    const prompt = promptChatSystem("sbp_advisor", { intake, assessment: null, whatIf: null, whatIfLabel: null });
    expect(prompt).toContain("Full SBP: covers $4,000 a month of retired pay; premium $260.00 a month");
    expect(prompt).toContain("spouse receives $2,200 a month for life");
    expect(prompt).toContain("Use them exactly. Never compute, estimate, or introduce any other SBP dollar figure");
    expect(prompt).toContain("Never invent an insurance premium, quote, or price");
    expect(prompt).toContain("notarized agreement");
    expect(prompt).toContain("Personal Financial Manager");
    expect(prompt).toContain("If a number is missing, ask for it; never guess one");
    expect(promptChatSystem("sbp_advisor", EMPTY_SBP_CONTEXT)).toContain("Nothing has been compared yet");
  });

  it("offers three questions", () => {
    expect(sbpSuggestions({ fromModel: [], married: true, asked: [] })).toEqual(["Which option fits my family best?", "What if I cover less than my full retired pay?", "How does SBP compare with term life for us?"]);
  });
});

describe("SBP chat download (D10)", () => {
  const analysis = sbpAnalysisForForm(FORM)!;
  const t = sbpTranscript([
    { role: "assistant", kind: "text", text: "How is your health?", local: true },
    { role: "user", text: "Good" },
    { role: "assistant", kind: "result", result: { type: "compare", form: FORM, result: { analysis, assessment: { snapshot: "Full SBP fits.", best_fit_option: "Full SBP", why_it_fits: ["Guaranteed income"], main_risks: [], strong_alternative: "Reduced SBP", if_you_value_flexibility_more: "", if_you_value_certainty_more: "", next_steps: ["Talk to your RSO"], missing_information: [] } } } },
    { role: "assistant", kind: "result", result: { type: "whatif", form: FORM, label: "covered amount $2,000 a month", analysis } },
  ]);
  const text = transcriptText(t, "2026-11-23");

  it("names nothing personal in its title or file name", () => {
    expect(transcriptFilename(t.title, "2026-11-23")).toBe("2026-11-23_sbp_decision_advisor_chat.docx");
  });

  it("writes the figures, the assessment, the what-if, and the answers", () => {
    expect(text).toContain("MilVector did not keep this file");
    expect(text).toContain("Assessment: Full SBP");
    expect(text).toContain("What if: covered amount $2,000 a month");
    expect(text).toContain("premium $260.00 a month");
    expect(text).toContain("Good");
    expect(text).not.toContain("How is your health?");
  });
});
