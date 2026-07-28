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
  // JD Decoder fit, MOS Translator, and LinkedIn judgment stages.
  TOOLS_MODEL: z.string().min(1).default("gpt-4.1"),
  OPENAI_BASE_URL: z.string().url().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
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
