import { describe, expect, it } from "vitest";
import { modelFor, priceFor, runCost, summarizeUsage, type RunRow } from "@/lib/admin/usage";

const models = { tools: "gpt-6-luna", masterResume: "gpt-6.2-sol", targetedResume: "gpt-6.2-sol" };
const now = new Date("2026-11-22T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
const run = (over: Partial<RunRow>): RunRow => ({
  user_id: "u1",
  tool_name: "jd_decoder",
  status: "success",
  latency_ms: 1000,
  tokens_in: 1000,
  tokens_out: 1000,
  created_at: daysAgo(1),
  input_json: {},
  ...over,
});

describe("pricing", () => {
  it("prices a model by its base name", () => {
    expect(priceFor("gpt-6.2-sol")).toEqual({ input: 2, output: 10 });
    expect(priceFor("gpt-6.2-sol-2026-11-01")).toEqual({ input: 2, output: 10 });
    expect(priceFor("some-other-model")).toBeNull();
  });

  it("uses the model a run recorded, else the tool's default", () => {
    expect(modelFor(run({ input_json: { _model: "gpt-6.2-sol" } }), models)).toBe("gpt-6.2-sol");
    expect(modelFor(run({ tool_name: "fitrep_bullets" }), models)).toBe("gpt-6.2-sol");
    expect(modelFor(run({ tool_name: "mos_translator" }), models)).toBe("gpt-6-luna");
  });

  it("costs tokens at list price", () => {
    // Luna: 1000 in x $0.10/M + 1000 out x $0.50/M
    expect(runCost(run({}), models)).toBeCloseTo(0.0006, 10);
    // Sol: 10k in x $2/M + 5k out x $10/M = 0.02 + 0.05
    expect(runCost(run({ input_json: { _model: "gpt-6.2-sol" }, tokens_in: 10000, tokens_out: 5000 }), models)).toBeCloseTo(0.07, 10);
    expect(runCost(run({ tokens_in: null, tokens_out: null }), models)).toBe(0);
    expect(runCost(run({ input_json: { _model: "mystery-1" } }), models)).toBeNull();
  });
});

describe("summarizeUsage", () => {
  const runs: RunRow[] = [
    run({ user_id: "u1", tool_name: "resume_targeter", created_at: daysAgo(1), latency_ms: 30000, input_json: { _model: "gpt-6.2-sol" }, tokens_in: 10000, tokens_out: 5000 }),
    run({ user_id: "u1", tool_name: "resume_targeter", created_at: daysAgo(1), input_json: { _step: true, _model: "gpt-6.2-sol" }, tokens_in: 10000, tokens_out: 5000 }),
    run({ user_id: "u2", tool_name: "jd_decoder", created_at: daysAgo(3), status: "error", latency_ms: 2000 }),
    run({ user_id: "u2", tool_name: "jd_decoder", created_at: daysAgo(20), latency_ms: 4000 }),
    run({ user_id: "admin", tool_name: "jd_decoder", created_at: daysAgo(1) }),
    run({ user_id: "u3", tool_name: "jd_decoder", created_at: daysAgo(40) }),
  ];
  const profiles = [
    { id: "u1", created_at: daysAgo(2) },
    { id: "u2", created_at: daysAgo(10) },
    { id: "u3", created_at: daysAgo(60) },
    { id: "admin", created_at: daysAgo(1) },
  ];
  const summary = summarizeUsage({ runs, profiles, now, models, labels: { resume_targeter: "Targeted Resume Builder", jd_decoder: "Job Description Decoder" }, excludeUserId: "admin" });
  const week = summary.windows.find((w) => w.days === 7)!;
  const month = summary.windows.find((w) => w.days === 30)!;

  it("counts members and leaves the admin out", () => {
    expect(summary.totalMembers).toBe(3);
    expect(week.newMembers).toBe(1);
    expect(month.newMembers).toBe(2);
  });

  it("counts actions, not the calls inside them, and who was active", () => {
    expect(week.actions).toBe(2);
    expect(week.activeMembers).toBe(2);
    expect(week.failedActions).toBe(1);
    expect(month.actions).toBe(3);
  });

  it("prices every call, steps included", () => {
    // Two Sol calls at $0.07 and one Luna call at $0.0006 in the week.
    expect(week.cost).toBeCloseTo(0.1406, 6);
  });

  it("breaks the month down by tool, busiest first, with times in seconds", () => {
    expect(summary.tools.map((t) => t.tool)).toEqual(["jd_decoder", "resume_targeter"]);
    const jd = summary.tools[0];
    expect(jd.actions).toBe(2);
    expect(jd.members).toBe(1);
    expect(jd.failedActions).toBe(1);
    expect(jd.p50Seconds).toBe(2);
    expect(jd.p90Seconds).toBe(4);
    const tr = summary.tools[1];
    expect(tr.actions).toBe(1);
    expect(tr.cost).toBeCloseTo(0.14, 6);
    expect(tr.costPerAction).toBeCloseTo(0.14, 6);
  });
});

describe("chat follow-ups in the usage view", () => {
  const runs: RunRow[] = [
    run({ user_id: "u1", tool_name: "mos_translator", created_at: daysAgo(1) }),
    run({ user_id: "u1", tool_name: "mos_translator", created_at: daysAgo(1), input_json: { _chat: true, _model: "gpt-6-luna" } }),
    run({ user_id: "u2", tool_name: "mos_translator", created_at: daysAgo(2), input_json: { _chat: true, _model: "gpt-6-luna" } }),
  ];
  const summary = summarizeUsage({ runs, profiles: [], now, models, labels: { mos_translator: "MOS Translator" } });
  const week = summary.windows.find((w) => w.days === 7)!;

  it("shows follow-ups as their own row, not as tool runs", () => {
    expect(summary.tools.map((t) => [t.tool, t.label, t.actions])).toEqual([
      ["mos_translator:chat", "MOS Translator follow-ups", 2],
      ["mos_translator", "MOS Translator", 1],
    ]);
  });

  it("counts tool runs as actions, but a member who only asked questions is still active, and every call is priced", () => {
    expect(week.actions).toBe(1);
    expect(week.activeMembers).toBe(2);
    expect(week.cost).toBeCloseTo(0.0018, 6);
  });
});
