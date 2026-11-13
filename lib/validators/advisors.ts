import { z } from "zod";

const resumeSource = {
  resumeArtifactId: z.string().uuid().optional(),
  resumeDocumentId: z.string().uuid().optional(),
  pastedResumeText: z.string().min(100).max(40000).optional(),
};

const transcriptTurn = z.object({
  role: z.enum(["interviewer", "candidate"]),
  text: z.string().min(1).max(6000),
});

export const MOCK_INTERVIEW_QUESTIONS = 6;

export const InterviewStrategistInputSchema = z.discriminatedUnion("stage", [
  z.object({
    stage: z.literal("prepare"),
    jobTitle: z.string().min(2).max(200),
    company: z.string().max(200).optional().nullable(),
    jobDescriptionText: z.string().min(100).max(30000),
    ...resumeSource,
  }),
  z.object({
    stage: z.literal("package"),
    jobTitle: z.string().min(2).max(200),
    company: z.string().max(200).optional().nullable(),
    jobDescriptionText: z.string().min(100).max(30000),
    ...resumeSource,
    roleAnalysis: z.record(z.any()),
    answers: z.array(z.object({ question: z.string().max(600), answer: z.string().max(3000) })).max(10),
    attirePreference: z.enum(["masculine", "feminine", "neutral", "all"]).default("all"),
  }),
  z.object({
    stage: z.literal("mock_turn"),
    jobTitle: z.string().min(2).max(200),
    company: z.string().max(200).optional().nullable(),
    briefing: z.record(z.any()),
    transcript: z.array(transcriptTurn).max(40),
  }),
  z.object({
    stage: z.literal("mock_review"),
    jobTitle: z.string().min(2).max(200),
    company: z.string().max(200).optional().nullable(),
    briefing: z.record(z.any()),
    transcript: z.array(transcriptTurn).min(2).max(40),
  }),
]);

const money = z.number().min(0).max(100_000_000);

export const SbpAdvisorInputSchema = z.object({
  // Family
  maritalStatus: z.enum(["married", "single", "divorced", "widowed"]),
  memberAgeAtRetirement: z.number().int().min(30).max(75),
  spouseAge: z.number().int().min(18).max(95).optional().nullable(),
  childrenAges: z.array(z.number().int().min(0).max(40)).max(12).default([]),
  formerSpouseOrCourtOrder: z.boolean().default(false),
  retirementType: z.enum(["active", "reserve", "medical"]).default("active"),
  spouseReliesOnRetiredPay: z.enum(["fully", "partly", "no"]).default("partly"),
  // Income and assets
  grossRetiredPay: money.min(100),
  vaCompensation: money.default(0),
  spouseIncome: money.default(0),
  otherIncome: money.default(0),
  investableAssets: money.default(0),
  existingLifeInsurance: money.default(0),
  monthlyExpenses: money.default(0),
  marginalTaxRatePct: z.number().min(0).max(50).default(22),
  // Health
  memberHealth: z.enum(["good", "some_issues", "serious_issues"]).default("good"),
  spouseHealth: z.enum(["good", "some_issues", "serious_issues"]).default("good"),
  tobaccoUse: z.boolean().default(false),
  // Priorities
  incomePreference: z.enum(["guaranteed_monthly", "lump_sum", "unsure"]).default("unsure"),
  lumpSumComfort: z.enum(["confident", "somewhat", "not_confident"]).default("somewhat"),
  inflationImportance: z.enum(["very", "somewhat", "not"]).default("very"),
  protectionHorizon: z.enum(["early_years", "spouse_lifetime", "unsure"]).default("spouse_lifetime"),
  // Options to compare
  reducedBaseAmount: money.optional().nullable(),
  termQuote: z
    .object({ coverage: money.min(1000), monthlyPremium: money.min(1), termYears: z.number().int().min(1).max(40) })
    .optional()
    .nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const VaNavigatorInputSchema = z.discriminatedUnion("stage", [
  z.object({
    stage: z.literal("identify"),
    conditions: z.array(z.string().min(2).max(160)).min(1).max(15),
  }),
  z.object({
    stage: z.literal("analyze"),
    condition: z.string().min(2).max(160),
    codes: z.array(z.string().regex(/^\d{4}$/)).min(1).max(3),
    dbqTitles: z.array(z.string().max(200)).max(3).default([]),
    details: z.string().max(4000).optional().nullable(),
  }),
]);
