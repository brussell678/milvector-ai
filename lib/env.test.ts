import { afterEach, describe, expect, it, vi } from "vitest";

// OpenAI retires these (gpt-5 family and o3 on 2026-12-11, gpt-4.1 and gpt-4o
// families on 2027-01-14). No default may name one.
const RETIRING = ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "gpt-5", "gpt-5-mini", "gpt-5-nano", "o3"];

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.resetModules();
});

describe("model defaults", () => {
  it("are the 2026-11-21 bake-off choices when no variable is set, and none is retiring", async () => {
    for (const key of Object.keys(process.env)) if (/_MODEL$|_EFFORT$/.test(key)) delete process.env[key];
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54399";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    vi.resetModules();
    const { getEnv } = await import("./env");
    const env = getEnv();

    const models = {
      OPENAI_MODEL: env.OPENAI_MODEL,
      TOOLS_MODEL: env.TOOLS_MODEL,
      MASTER_RESUME_MODEL: env.MASTER_RESUME_MODEL,
      MASTER_STRUCTURE_MODEL: env.MASTER_STRUCTURE_MODEL,
      TARGETED_RESUME_MODEL: env.TARGETED_RESUME_MODEL,
    };
    expect(models).toEqual({
      OPENAI_MODEL: "gpt-6-luna",
      TOOLS_MODEL: "gpt-6-luna",
      MASTER_RESUME_MODEL: "gpt-6.2-sol",
      MASTER_STRUCTURE_MODEL: "gpt-6-luna",
      TARGETED_RESUME_MODEL: "gpt-6.2-sol",
    });
    expect(env.LLM_REASONING_EFFORT).toBe("low");
    expect(env.TARGETED_RESUME_EFFORT).toBe("medium");
    for (const model of Object.values(models)) expect(RETIRING).not.toContain(model);
  });
});
