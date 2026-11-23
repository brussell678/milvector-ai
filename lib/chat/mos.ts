// The MOS Translator's shapes, shared by the classic page, the chat, and the
// follow-up endpoint. The request body comes from one function, so the chat
// sends exactly what the form sends (docs/CHAT_TOOLS_PLAN.md, 1.3).

export type MosForm = { mos: string; yearsExp: string; billets: string; interests: string };

export type MosPayload = { mos: string; billets: string[]; yearsExp: number | null; interests: string[] };

export type CivilianRole = {
  title: string;
  match_strength?: string;
  why_fit: string;
  common_industries: string[];
  keywords: string[];
};

export type RecommendedCert = { name: string; why: string; time_to_get: string };

export type MosResult = { runId: string | null; civilian_roles: CivilianRole[]; recommended_certs: RecommendedCert[] };

export const EMPTY_MOS_FORM: MosForm = { mos: "", yearsExp: "", billets: "", interests: "" };

/** The honest match label comes from the model's match_strength, not list position. */
export function matchBadge(strength?: string): { label: string; className: string } {
  const value = (strength ?? "").trim().toLowerCase();
  if (value === "strong") return { label: "Strong Match", className: "tool-badge-success" };
  if (value === "moderate") return { label: "Moderate Match", className: "tool-badge-success" };
  if (value === "exploratory") return { label: "Exploratory", className: "tool-badge-warn" };
  return { label: "Match", className: "tool-badge-warn" };
}

const list = (value: string) =>
  value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** The body /api/tools/mos-translator takes, from what the member typed. */
export function mosPayload(form: MosForm): MosPayload {
  return {
    mos: form.mos,
    billets: list(form.billets),
    yearsExp: form.yearsExp ? Number(form.yearsExp) : null,
    interests: list(form.interests),
  };
}

/** The form a payload came from, for a proposed run the member taps. */
export function mosFormFrom(payload: MosPayload): MosForm {
  return {
    mos: payload.mos,
    yearsExp: payload.yearsExp === null || payload.yearsExp === undefined ? "" : String(payload.yearsExp),
    billets: payload.billets.join(", "),
    interests: payload.interests.join(", "),
  };
}

/** One line naming a run's inputs: "0311, 8 years, billets: ..., interests: ...". */
export function mosSummary(payload: MosPayload): string {
  const parts = [payload.mos.trim() || "No MOS yet"];
  if (payload.yearsExp !== null && payload.yearsExp !== undefined) parts.push(`${payload.yearsExp} ${payload.yearsExp === 1 ? "year" : "years"}`);
  if (payload.billets.length) parts.push(`billets: ${payload.billets.join(", ")}`);
  if (payload.interests.length) parts.push(`interests: ${payload.interests.join(", ")}`);
  return parts.join("; ");
}

const withArticle = (title: string) => `${/^[aeiou]/i.test(title) ? "an" : "a"} ${title}`;

/**
 * Three questions to tap: the model's own suggestions first, then the page's
 * list, leaving out anything the member already asked. The model is asked for
 * three but can return fewer, so the chips never run dry.
 */
export function mosSuggestions(args: { fromModel: string[]; roles: string[]; asked: string[] }): string[] {
  const [first, second] = args.roles;
  const pool = [
    ...args.fromModel,
    "Which of these fits me best, and why?",
    ...(first ? [`What does ${withArticle(first)} do all day?`] : []),
    "Which certification should I start with?",
    ...(second ? [`What does ${withArticle(second)} do all day?`] : []),
    "How do I describe my experience for these jobs?",
  ];
  const seen = new Set(args.asked.map((q) => q.trim().toLowerCase()));
  const out: string[] = [];
  for (const q of pool) {
    const key = q.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length === 3) break;
  }
  return out;
}

/** What a proposed run changes from the last one, in words, for its button. */
export function mosChanges(from: MosPayload | null, to: MosPayload): string {
  if (!from) return mosSummary(to);
  const changes: string[] = [];
  if (from.mos.trim().toLowerCase() !== to.mos.trim().toLowerCase()) changes.push(`MOS ${to.mos}`);
  if ((from.yearsExp ?? null) !== (to.yearsExp ?? null)) changes.push(to.yearsExp === null ? "no years" : `${to.yearsExp} years`);
  const same = (a: string[], b: string[]) => a.map((x) => x.toLowerCase()).sort().join("|") === b.map((x) => x.toLowerCase()).sort().join("|");
  if (!same(from.billets, to.billets)) changes.push(to.billets.length ? `billets: ${to.billets.join(", ")}` : "no billets");
  if (!same(from.interests, to.interests)) changes.push(to.interests.length ? `interests: ${to.interests.join(", ")}` : "no interests");
  return changes.length ? changes.join("; ") : mosSummary(to);
}
