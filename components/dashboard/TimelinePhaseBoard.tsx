"use client";

import { useMemo, useState } from "react";
import { TaskDrawer } from "./TaskDrawer";
import type { DashboardLink, DashboardTask } from "./types";

const PHASE_ORDER = [24, 18, 12, 9, 6, 3, 0] as const;
const PHASE_LABEL: Record<number, string> = {
  24: "24 months",
  18: "18 months",
  12: "12 months",
  9: "9 months",
  6: "6 months",
  3: "3 months",
  0: "Final",
};

function normalizeCategory(input: string | null) {
  return String(input ?? "").trim().toLowerCase();
}

function assistanceText(task: DashboardTask) {
  if (task.assistance_type === "tool" || task.tool_link) return "Tool";
  if (task.assistance_type === "doc" || task.assistance_ref) return "File";
  return "None";
}

export function TimelinePhaseBoard({
  tasks,
  initialCompletedTaskIds,
  links,
}: {
  tasks: DashboardTask[];
  initialCompletedTaskIds: string[];
  links: DashboardLink[];
}) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set(initialCompletedTaskIds));
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<DashboardTask | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<number, DashboardTask[]>();
    for (const month of PHASE_ORDER) map.set(month, []);
    for (const task of tasks) {
      const current = map.get(task.phase_month) ?? [];
      current.push(task);
      map.set(task.phase_month, current);
    }
    return map;
  }, [tasks]);

  async function toggle(taskId: string) {
    const nextCompleted = !completedIds.has(taskId);
    const previous = new Set(completedIds);
    const optimistic = new Set(completedIds);
    if (nextCompleted) optimistic.add(taskId);
    else optimistic.delete(taskId);

    setCompletedIds(optimistic);
    setSavingId(taskId);

    const res = await fetch("/api/transition-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, completed: nextCompleted }),
    });

    if (!res.ok) setCompletedIds(previous);
    setSavingId(null);
  }

  const selectedLinks = selectedTask
    ? links.filter((link) => normalizeCategory(link.category) === normalizeCategory(selectedTask.category)).slice(0, 6)
    : [];

  return (
    <>
      {PHASE_ORDER.map((month) => {
        const phaseTasks = grouped.get(month) ?? [];
        return (
          <section key={month} className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold">Phase: {PHASE_LABEL[month]}</h2>
              <p className="text-xs text-[var(--muted)]">{phaseTasks.length} milestones</p>
            </div>
            <div className="mt-3 space-y-2">
              {phaseTasks.length === 0 && <p className="text-sm text-[var(--muted)]">No milestones in this phase.</p>}
              {phaseTasks.map((task) => {
                const completed = completedIds.has(task.id);
                return (
                  <article key={task.id} className="rounded-md border border-[var(--line)] p-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={completed}
                        disabled={savingId === task.id}
                        onChange={() => void toggle(task.id)}
                      />
                      <div className="w-full">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold">{task.title}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              completed ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--surface)] text-[var(--muted)]"
                            }`}
                          >
                            {completed ? "Completed" : "Open"}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                          <span>{task.category ?? "Uncategorized"}</span>
                          <span>Assist: {assistanceText(task)}</span>
                          {typeof task.days_before_event === "number" && <span>{task.days_before_event} days before anchor</span>}
                        </div>
                        {task.description && <p className="mt-1 text-sm text-[var(--muted)]">{task.description}</p>}
                        <button className="btn btn-secondary mt-2 !py-1 text-xs" type="button" onClick={() => setSelectedTask(task)}>
                          Open Task Details
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      <TaskDrawer task={selectedTask} links={selectedLinks} onClose={() => setSelectedTask(null)} />
    </>
  );
}
