// The admin usage view: who is using MilVector and what the AI costs, from
// tool_runs and profiles. Pure functions; app/app/admin/page.tsx loads the rows.

// List prices in USD per 1M tokens, as recorded for the model bake-off on
// 2026-11-21. Cached input is priced as plain input, so totals lean high.
export const PRICES_AS_OF = "2026-11-21";
export const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-6.2-sol": { input: 2, output: 10 },
  "gpt-6.2-astra": { input: 8, output: 40 },
  "gpt-6.1-terra": { input: 1, output: 5 },
  "gpt-6-luna": { input: 0.1, output: 0.5 },
  "gpt-5.5": { input: 5, output: 30 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
  "gpt-4.1": { input: 2, output: 8 },
};

export type RunRow = {
  user_id: string;
  tool_name: string;
  status: string;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
  input_json: Record<string, unknown> | null;
};
export type ProfileRow = { id: string; created_at: string | null };
export type Models = { tools: string; masterResume: string; targetedResume: string };

export type WindowStats = { days: number; newMembers: number; activeMembers: number; actions: number; failedActions: number; cost: number; unpricedRuns: number };
export type ToolStats = { tool: string; label: string; actions: number; members: number; failedActions: number; p50Seconds: number | null; p90Seconds: number | null; cost: number; costPerAction: number | null };
export type UsageSummary = { totalMembers: number; windows: WindowStats[]; tools: ToolStats[] };

const DAY_MS = 24 * 60 * 60 * 1000;

/** The price for a model id, matching a dated or suffixed id to its base name. */
export function priceFor(model: string): { input: number; output: number } | null {
  if (PRICES[model]) return PRICES[model];
  const base = Object.keys(PRICES)
    .filter((key) => model.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return base ? PRICES[base] : null;
}

/** The model a run used: recorded on newer runs, otherwise the tool's configured default. */
export function modelFor(row: RunRow, models: Models): string {
  const recorded = row.input_json?._model;
  if (typeof recorded === "string" && recorded) return recorded;
  if (row.tool_name === "fitrep_bullets") return models.masterResume;
  if (row.tool_name === "resume_targeter") return models.targetedResume;
  return models.tools;
}

/** Estimated dollars for one run, or null when its model has no price. */
export function runCost(row: RunRow, models: Models): number | null {
  if (row.tokens_in == null && row.tokens_out == null) return 0;
  const price = priceFor(modelFor(row, models));
  if (!price) return null;
  return ((row.tokens_in ?? 0) * price.input + (row.tokens_out ?? 0) * price.output) / 1e6;
}

/** A member action, not an internal call inside one (see lib/usage-limit.ts). */
export const isAction = (row: RunRow) => !row.input_json?._step;

/** A follow-up question in a chat tool (lib/chat/limit.ts): its own budget, so its own row. */
export const isChat = (row: RunRow) => !!row.input_json?._chat;

/** The usage row a run belongs to: the tool, or the tool's chat follow-ups. */
export const usageKey = (row: RunRow) => (isChat(row) ? `${row.tool_name}:chat` : row.tool_name);

function labelFor(key: string, labels: Record<string, string>): string {
  if (labels[key]) return labels[key];
  const chat = /^(.+):chat$/.exec(key);
  return chat ? `${labels[chat[1]] ?? chat[1]} follow-ups` : key;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

export function summarizeUsage(args: {
  runs: RunRow[];
  profiles: ProfileRow[];
  now: Date;
  models: Models;
  labels: Record<string, string>;
  excludeUserId?: string | null;
}): UsageSummary {
  const exclude = args.excludeUserId ?? null;
  const runs = args.runs.filter((row) => row.user_id !== exclude);
  const profiles = args.profiles.filter((row) => row.id !== exclude);
  const since = (days: number) => args.now.getTime() - days * DAY_MS;
  const within = (iso: string | null, days: number) => !!iso && new Date(iso).getTime() >= since(days);

  const windows = [7, 30].map((days) => {
    const inWindow = runs.filter((row) => within(row.created_at, days));
    // Tool runs only; follow-up questions show in their own tool rows.
    const actions = inWindow.filter((row) => isAction(row) && !isChat(row));
    let cost = 0;
    let unpricedRuns = 0;
    for (const row of inWindow) {
      const c = runCost(row, args.models);
      if (c === null) unpricedRuns++;
      else cost += c;
    }
    return {
      days,
      newMembers: profiles.filter((row) => within(row.created_at, days)).length,
      activeMembers: new Set(inWindow.filter(isAction).map((row) => row.user_id)).size,
      actions: actions.length,
      failedActions: actions.filter((row) => row.status === "error").length,
      cost,
      unpricedRuns,
    };
  });

  const month = runs.filter((row) => within(row.created_at, 30));
  const byTool = new Map<string, RunRow[]>();
  for (const row of month) byTool.set(usageKey(row), [...(byTool.get(usageKey(row)) ?? []), row]);
  const tools = [...byTool].map(([tool, rows]) => {
    const actions = rows.filter(isAction);
    const latencies = actions.map((row) => row.latency_ms).filter((ms): ms is number => typeof ms === "number").sort((a, b) => a - b);
    const cost = rows.reduce((sum, row) => sum + (runCost(row, args.models) ?? 0), 0);
    const p50 = percentile(latencies, 50);
    const p90 = percentile(latencies, 90);
    return {
      tool,
      label: labelFor(tool, args.labels),
      actions: actions.length,
      members: new Set(actions.map((row) => row.user_id)).size,
      failedActions: actions.filter((row) => row.status === "error").length,
      p50Seconds: p50 === null ? null : p50 / 1000,
      p90Seconds: p90 === null ? null : p90 / 1000,
      cost,
      costPerAction: actions.length ? cost / actions.length : null,
    };
  });
  tools.sort((a, b) => b.actions - a.actions || b.cost - a.cost);

  return { totalMembers: profiles.length, windows, tools };
}
