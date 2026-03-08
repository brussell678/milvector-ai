import type { DashboardTask } from "./types";

function assistanceLabel(task: DashboardTask) {
  if (task.assistance_type === "tool" || !!task.tool_link) return "Tool Assist";
  if (task.assistance_type === "doc" || !!task.assistance_ref) return "File Assist";
  return "No Assist";
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
  return (
    <article className="rounded-md border border-[var(--line)] p-3">
      <div className="flex items-start gap-3">
        <input type="checkbox" className="mt-1" checked={checked} onChange={() => onToggle(task.id)} disabled={busy} />
        <div className="w-full">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{task.title}</p>
            <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
              {assistanceLabel(task)}
            </span>
          </div>
          {task.description && <p className="mt-1 text-sm text-[var(--muted)]">{task.description}</p>}
          <button className="btn btn-secondary mt-2 !py-1 text-xs" type="button" onClick={() => onOpen(task)}>
            Open Task Details
          </button>
        </div>
      </div>
    </article>
  );
}
