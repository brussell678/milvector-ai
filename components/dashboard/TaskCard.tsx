import type { DashboardTask } from "./types";

function assistanceLabel(task: DashboardTask) {
  if (task.assistance_type === "tool" || !!task.tool_link) return "Tool Assist";
  if (task.assistance_type === "doc" || !!task.assistance_ref) return "File Assist";
  return "No Assist";
}

function isFallbackTask(task: DashboardTask) {
  return task.id.startsWith("fallback:");
}

export function TaskCard({
  task,
  checked,
  busy,
  onToggle,
  onOpen,
}: {
  task: DashboardTask;
  checked: boolean;
  busy: boolean;
  onToggle: (taskId: string) => void;
  onOpen: (task: DashboardTask) => void;
}) {
  const readOnly = isFallbackTask(task);

  return (
    <article className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0"
          checked={checked}
          onChange={() => onToggle(task.id)}
          disabled={busy || readOnly}
        />
        <div className="w-full">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{task.title}</p>
            <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
              {assistanceLabel(task)}
            </span>
            {readOnly && (
              <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                Reference
              </span>
            )}
          </div>
          {task.description && <p className="mt-1 text-sm text-[var(--muted)]">{task.description}</p>}
          {readOnly && <p className="mt-1 text-xs text-[var(--muted)]">Showing retirement-source reference tasks until the timeline database is reseeded.</p>}
          <button className="btn btn-secondary mt-3 w-full text-xs sm:w-auto" type="button" onClick={() => onOpen(task)}>
            Open Task Details
          </button>
        </div>
      </div>
    </article>
  );
}
