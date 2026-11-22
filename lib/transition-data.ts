import path from "node:path";
import { readFile } from "node:fs/promises";

type FallbackSupportingTask = {
  title: string;
  description: string | null;
  order_index: number;
};

type FallbackTask = {
  external_id: string;
  title: string;
  description: string | null;
  category: string;
  phase_month: number;
  days_before_event: number | null;
  assistance_type: "tool" | "doc" | "none";
  assistance_ref: string | null;
  assistance_notes: string | null;
  // A MilVector tool that does the task, shown beside the document link.
  tool_link?: string | null;
  supporting_tasks: FallbackSupportingTask[];
};

type FallbackTaskPayload = {
  tasks: FallbackTask[];
};

type FallbackLink = {
  external_id: string;
  title: string;
  category: string;
  description: string | null;
  url: string | null;
  source: string | null;
  review_status: "ready" | "needs_review";
  raw_reference?: string | null;
};

type FallbackLinkPayload = {
  links: FallbackLink[];
};

type DashboardTaskLike = {
  id: string;
  external_id?: string | null;
  title: string;
  description: string | null;
  category: string | null;
  phase_month: number;
  days_before_event: number | null;
  tool_link: string | null;
  knowledge_article: string | null;
  assistance_type: "tool" | "doc" | "none";
  assistance_ref: string | null;
  assistance_notes: string | null;
  transition_supporting_tasks: Array<{ title: string; description: string | null; order_index: number; id?: string }>;
};

type LibraryLinkLike = {
  external_id?: string | null;
  id: string;
  title: string;
  description: string | null;
  category: string;
  url: string;
  source?: string | null;
  review_status?: "ready" | "needs_review";
  raw_reference?: string | null;
};

async function readJson<T>(fileName: string): Promise<T> {
  const fullPath = path.join(process.cwd(), "data", fileName);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw) as T;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

const LEGACY_TIMELINE_TITLES = new Set([
  "build transition plan",
  "start profile and eas baseline",
  "translate mos to civilian language",
  "begin targeted networking",
  "build master resume",
  "research skillbridge pathways",
  "decode job descriptions",
  "create targeted resumes",
  "execute application sprint",
  "finalize transition handoff",
]);

export async function getTransitionTaskFallbacks() {
  const payload = await readJson<FallbackTaskPayload>("milvector_transition_tasks.json");
  return payload.tasks ?? [];
}

export async function getLibraryLinkFallbacks() {
  const payload = await readJson<FallbackLinkPayload>("milvector_library_links.json");
  return (payload.links ?? []).filter((link) => link.review_status === "ready" && !!link.url);
}

/**
 * The task data names library files as "./docs/public/<file>", a path no
 * page serves. The files are served by /api/public-docs/<file>, as on the
 * Library page. Anything else passes through unchanged.
 */
export function publicDocHref(ref: string | null): string | null {
  if (!ref) return ref;
  const match = /^\.?\/?docs\/public\/(.+)$/.exec(ref);
  return match ? `/api/public-docs/${encodeURIComponent(match[1])}` : ref;
}

function shouldUseFallbackTasks<T extends DashboardTaskLike>(tasks: T[]) {
  if (tasks.length === 0) return true;
  const withExternalId = tasks.filter((task) => !!task.external_id).length;
  const legacyMatches = tasks.filter((task) => LEGACY_TIMELINE_TITLES.has(normalize(task.title))).length;
  return withExternalId === 0 && legacyMatches >= Math.min(3, tasks.length);
}

function toFallbackDashboardTasks<T extends DashboardTaskLike>(fallbackTasks: FallbackTask[]) {
  return fallbackTasks.map(
    (task) =>
      ({
        id: `fallback:${task.external_id}`,
        external_id: task.external_id,
        title: task.title,
        description: task.description,
        category: task.category,
        phase_month: task.phase_month,
        days_before_event: task.days_before_event,
        tool_link: task.tool_link ?? null,
        knowledge_article: null,
        assistance_type: task.assistance_type,
        assistance_ref: task.assistance_ref,
        assistance_notes: task.assistance_notes,
        transition_supporting_tasks: task.supporting_tasks,
      }) as T
  );
}

// Timeline order: the earliest phase first (24 months), then the task due
// earliest within it, then title. Sorting after the overlay lets the curated
// data decide where a task sits, even when its database row says otherwise.
function byTimeline(a: DashboardTaskLike, b: DashboardTaskLike) {
  return b.phase_month - a.phase_month || (b.days_before_event ?? -1) - (a.days_before_event ?? -1) || a.title.localeCompare(b.title);
}

/**
 * The tasks a member sees: database rows overlaid with the curated task data
 * (matched by external id, then title), in Timeline order. Library file links
 * are pointed at the route that serves them. `canOpen` drops a tool link the
 * member cannot use yet, such as a tool still in preview.
 */
export function mergeDashboardTasks<T extends DashboardTaskLike>(tasks: T[], fallbackTasks: FallbackTask[], canOpen: (href: string) => boolean = () => true) {
  const finish = (task: T): T => ({
    ...task,
    assistance_ref: publicDocHref(task.assistance_ref),
    tool_link: task.tool_link && canOpen(task.tool_link) ? task.tool_link : null,
  });

  if (shouldUseFallbackTasks(tasks)) {
    return toFallbackDashboardTasks<T>(fallbackTasks).map(finish).sort(byTimeline);
  }

  const byExternalId = new Map(fallbackTasks.map((task) => [task.external_id, task]));
  const byTitle = new Map(fallbackTasks.map((task) => [normalize(task.title), task]));

  return tasks.map((task) => {
    const fallback = (task.external_id && byExternalId.get(task.external_id)) ?? byTitle.get(normalize(task.title));
    if (!fallback) return finish(task);

    return finish({
      ...task,
      // The curated title wins, so a corrected title shows without a reseed.
      title: fallback.title ?? task.title,
      description: fallback.description ?? task.description,
      category: fallback.category ?? task.category,
      phase_month: fallback.phase_month ?? task.phase_month,
      days_before_event: fallback.days_before_event ?? task.days_before_event,
      assistance_type: fallback.assistance_type ?? task.assistance_type,
      assistance_ref: fallback.assistance_ref ?? task.assistance_ref,
      assistance_notes: fallback.assistance_notes ?? task.assistance_notes,
      tool_link: fallback.tool_link ?? task.tool_link,
      transition_supporting_tasks:
        fallback.supporting_tasks.length > 0 ? fallback.supporting_tasks : task.transition_supporting_tasks,
    });
  }).sort(byTimeline);
}

export function mergeLibraryLinks<T extends LibraryLinkLike>(primary: T[], fallback: FallbackLink[]) {
  const byKey = new Map<string, T>();

  for (const link of primary) {
    byKey.set(`${normalize(link.title)}|${normalize(link.category)}`, link);
  }

  for (const fallbackLink of fallback) {
    const key = `${normalize(fallbackLink.title)}|${normalize(fallbackLink.category)}`;
    const existing = byKey.get(key);

    if (existing) {
      byKey.set(key, {
        ...existing,
        description: fallbackLink.description ?? existing.description,
        source: fallbackLink.source ?? existing.source,
        raw_reference: fallbackLink.raw_reference ?? existing.raw_reference,
      });
      continue;
    }

    byKey.set(key, {
      id: fallbackLink.external_id,
      external_id: fallbackLink.external_id,
      title: fallbackLink.title,
      description: fallbackLink.description,
      category: fallbackLink.category,
      url: fallbackLink.url ?? "",
      source: fallbackLink.source,
      review_status: fallbackLink.review_status,
      raw_reference: fallbackLink.raw_reference ?? null,
    } as T);
  }

  return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
}
