import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type SupportingTask = {
  title: string;
  description: string | null;
  order_index: number;
};

type TransitionTask = {
  external_id: string;
  title: string;
  description: string | null;
  category: string;
  anchor_event: "EAS" | "TERMINAL" | "PTAD" | "CEREMONY";
  days_before_event: number | null;
  phase: string;
  phase_month: number;
  task_type: "milestone" | "informational";
  is_milestone: boolean;
  priority: "low" | "medium" | "high";
  source_sheet: string;
  source_row: number;
  assistance_type: "tool" | "doc" | "none";
  assistance_ref: string | null;
  assistance_notes: string | null;
  supporting_tasks: SupportingTask[];
};

type TaskPayload = {
  tasks: TransitionTask[];
};

type LibraryLink = {
  external_id: string;
  title: string;
  category: string;
  description: string | null;
  url: string | null;
  source: string;
  source_sheet: string;
  source_row: number;
  review_status: "ready" | "needs_review";
  raw_reference: string;
};

type LinkPayload = {
  links: LibraryLink[];
};

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const tasksPath = path.join(process.cwd(), "data", "milvector_transition_tasks.json");
  const linksPath = path.join(process.cwd(), "data", "milvector_library_links.json");

  const taskPayload = await readJson<TaskPayload>(tasksPath);
  const linkPayload = await readJson<LinkPayload>(linksPath);

  const tasksUpsert = taskPayload.tasks.map((task) => ({
    external_id: task.external_id,
    title: task.title,
    description: task.description,
    category: task.category,
    anchor_event: task.anchor_event,
    days_before_event: task.days_before_event,
    phase: task.phase,
    phase_month: task.phase_month,
    task_type: task.task_type,
    is_milestone: task.is_milestone,
    priority: task.priority,
    assistance_type: task.assistance_type,
    assistance_ref: task.assistance_ref,
    assistance_notes: task.assistance_notes,
    source_sheet: task.source_sheet,
    source_row: task.source_row,
  }));

  const { error: tasksError } = await supabase
    .from("transition_tasks")
    .upsert(tasksUpsert, { onConflict: "external_id" });

  if (tasksError) throw tasksError;

  const externalIds = taskPayload.tasks.map((task) => task.external_id);
  const { data: storedTasks, error: tasksFetchError } = await supabase
    .from("transition_tasks")
    .select("id,external_id")
    .in("external_id", externalIds);

  if (tasksFetchError) throw tasksFetchError;

  const idByExternalId = new Map((storedTasks ?? []).map((row) => [row.external_id, row.id]));
  const taskIds = [...idByExternalId.values()];

  if (taskIds.length > 0) {
    const { error: deleteSupportingError } = await supabase
      .from("transition_supporting_tasks")
      .delete()
      .in("task_id", taskIds);
    if (deleteSupportingError) throw deleteSupportingError;
  }

  const supportingRows = taskPayload.tasks.flatMap((task) => {
    const taskId = idByExternalId.get(task.external_id);
    if (!taskId) return [];
    return task.supporting_tasks.map((support) => ({
      task_id: taskId,
      title: support.title,
      description: support.description,
      order_index: support.order_index,
    }));
  });

  if (supportingRows.length > 0) {
    const { error: supportingError } = await supabase.from("transition_supporting_tasks").insert(supportingRows);
    if (supportingError) throw supportingError;
  }

  const readyLinks = linkPayload.links.filter((link) => link.review_status === "ready" && !!link.url);
  const linksUpsert = readyLinks.map((link) => ({
    external_id: link.external_id,
    title: link.title,
    description: link.description,
    category: link.category,
    url: link.url,
    source: link.source,
    review_status: link.review_status,
    raw_reference: link.raw_reference,
    source_sheet: link.source_sheet,
    source_row: link.source_row,
  }));

  if (linksUpsert.length > 0) {
    const { error: linksError } = await supabase
      .from("library_links")
      .upsert(linksUpsert, { onConflict: "external_id" });
    if (linksError) throw linksError;
  }

  console.log(`Upserted ${tasksUpsert.length} transition tasks.`);
  console.log(`Inserted ${supportingRows.length} supporting task rows.`);
  console.log(`Upserted ${linksUpsert.length} ready library links.`);
  console.log(`Skipped ${linkPayload.links.length - linksUpsert.length} links marked needs_review.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
