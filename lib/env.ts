import { z } from "zod";

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const ServerEnvSchema = PublicEnvSchema.extend({
  OPENAI_API_KEY: z.string().min(1).optional(),
  // Base/cheap model. Judgment-heavy tools override via the *_MODEL vars below.
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  // Quality models for judgment-heavy, career-affecting output. Default to gpt-4.1
  // (quality over cost); override per environment if needed.
  MASTER_RESUME_MODEL: z.string().min(1).default("gpt-4.1"),
  TARGETED_RESUME_MODEL: z.string().min(1).default("gpt-4.1"),
  // Reasoning effort for AI calls on a reasoning model (gpt-6-luna and later
  // default to medium, which is slower and costs more than these tools need).
  // Empty means the model's default.
  LLM_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  // JD Decoder fit, MOS Translator, and LinkedIn judgment stages.
  TOOLS_MODEL: z.string().min(1).default("gpt-4.1"),
  OPENAI_BASE_URL: z.string().url().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  // AI runs allowed per user in a rolling 24 hours (see lib/usage-limit.ts).
  // A full targeted resume is 3 runs and a full LinkedIn build is about 6.
  AI_DAILY_RUN_LIMIT: z.coerce.number().int().min(1).max(10000).default(60),
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
