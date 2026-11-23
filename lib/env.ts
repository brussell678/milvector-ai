import { z } from "zod";

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const ServerEnvSchema = PublicEnvSchema.extend({
  OPENAI_API_KEY: z.string().min(1).optional(),
  // Model defaults chosen in the 2026-11-21 bake-off (docs/TARGETED_RESUME_PLAN.md,
  // Phase 3). The code holds the choice; set a variable only to override one.
  // Base model for every call that names no model of its own.
  OPENAI_MODEL: z.string().min(1).default("gpt-6-luna"),
  // Master Resume Builder: drafting a member's first master from their
  // evaluations. gpt-6.2-sol gave the fullest draft with no filler.
  MASTER_RESUME_MODEL: z.string().min(1).default("gpt-6.2-sol"),
  // Splitting a member's master into roles and lines for the Targeted Resume
  // Builder: a copying task verified word for word. A small model does it as
  // well as a large one (gpt-6-luna matched gpt-4.1 exactly; Sol dropped two
  // roles).
  MASTER_STRUCTURE_MODEL: z.string().min(1).default("gpt-6-luna"),
  // Targeted Resume Builder writing steps: plan, rewrite, summary, fill.
  TARGETED_RESUME_MODEL: z.string().min(1).default("gpt-6.2-sol"),
  // The fit check the builder and the JD Decoder share (lib/resume/fit-check.ts).
  // Falls back to the builder's model and effort.
  FIT_CHECK_MODEL: z.string().min(1).optional(),
  FIT_CHECK_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  // Reasoning effort for every AI call on a reasoning model (GPT-5 and later,
  // which default to medium: slower and costlier than most tools need).
  LLM_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).default("low"),
  // Reasoning effort for the Targeted Resume Builder's writing steps, and a
  // separate model and effort for its verification step.
  TARGETED_RESUME_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).default("medium"),
  // The model verification step: off by default. In the 2026-11-21 bake-off
  // Brandon marked every bullet it flagged as supported, so its retries cost
  // time and tailoring for no gain. The code checks always run.
  TARGETED_RESUME_VERIFY: z.enum(["on", "off"]).default("off"),
  TARGETED_RESUME_VERIFY_MODEL: z.string().min(1).optional(),
  TARGETED_RESUME_VERIFY_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  // The lighter tools: JD Decoder, MOS Translator, LinkedIn, interview prep,
  // SBP and VA advisors. gpt-6-luna won 6 of 9 blind picks against gpt-4.1.
  TOOLS_MODEL: z.string().min(1).default("gpt-6-luna"),
  OPENAI_BASE_URL: z.string().url().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  // AI runs allowed per user in a rolling 24 hours (see lib/usage-limit.ts).
  // A run is a member action: a targeted resume's fit check and build are two,
  // however many AI calls the build makes inside.
  AI_DAILY_RUN_LIMIT: z.coerce.number().int().min(1).max(10000).default(60),
  // The VA Rating Navigator's analyses and code lookups have their own budget
  // (docs/CHAT_TOOLS_PLAN.md, D18): a retiree claims 25 to 40 conditions, and
  // they run on the low-cost model, so they do not use up the 60 runs.
  VA_DAILY_RUN_LIMIT: z.coerce.number().int().min(1).max(10000).default(150),
  // Follow-up questions in the chat tools (docs/CHAT_TOOLS_PLAN.md): their own
  // budget per member in a rolling 24 hours, apart from the run limit above.
  CHAT_DAILY_MESSAGE_LIMIT: z.coerce.number().int().min(1).max(10000).default(100),
  // Counted per tool (D17); the VA chat's own, for a claim with many conditions.
  CHAT_VA_DAILY_MESSAGE_LIMIT: z.coerce.number().int().min(1).max(10000).default(300),
  // The model and effort for follow-up answers. Fall back to TOOLS_MODEL and
  // LLM_REASONING_EFFORT.
  CHAT_MODEL: z.string().min(1).optional(),
  CHAT_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
});

let cachedEnv: z.infer<typeof ServerEnvSchema> | null = null;

export function getEnv() {
  if (cachedEnv) return cachedEnv;

  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables: ${details}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
