"use client";

import { useMemo, useState } from "react";
import { TaskCard } from "./TaskCard";
import { TaskDrawer } from "./TaskDrawer";
import { getTaskLinks } from "./task-linking";
import type { DashboardLink, DashboardTask } from "./types";

const PHASE_ORDER = [24, 18, 12, 9, 6, 3, 0] as const;
const PHASE_LABEL: Record<number, string> = {
  24: "24 Months",
  18: "18 Months",
  12: "12 Months",
  9: "9 Months",
  6: "6 Months",
  3: "3 Months",
  0: "Final Approach",
};

export function TimelinePhaseBoard({
  tasks,
  initialCompletedTaskIds,
  links,
  currentPhaseMonth,
}: {
  tasks: DashboardTask[];
  initialCompletedTaskIds: string[];
  links: DashboardLink[];
  currentPhaseMonth?: number;
}) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set(initialCompletedTaskIds));
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<DashboardTask | null>(null);
  const [openPhases, setOpenPhases] = useState<Set<number>>(
    () => new Set([currentPhaseMonth ?? 24])
  );

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
    if (taskId.startsWith("fallback:")) return;

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

  const selectedLinks = selectedTask ? getTaskLinks(selectedTask, links) : [];

  function togglePhase(month: number) {
    setOpenPhases((current) => {
      const next = new Set(current);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  }

  return (
    <section className="grid gap-4">
      {PHASE_ORDER.map((month) => {
        const phaseTasks = grouped.get(month) ?? [];
        const completedCount = phaseTasks.filter((task) => completedIds.has(task.id)).length;
        const isCurrent = currentPhaseMonth === month;
        const isOpen = openPhases.has(month);
        return (
          <section
            key={month}
            className={[
              "panel overflow-hidden",
              isCurrent ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]" : "",
            ].join(" ")}
          >
            <button
              type="button"
              className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-5"
              aria-expanded={isOpen}
              aria-controls={`timeline-phase-${month}`}
              onClick={() => togglePhase(month)}
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">Phase: {PHASE_LABEL[month]}</span>
                  {isCurrent ? (
                    <span className="rounded-full bg-[var(--accent)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
                      Current
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs text-[var(--muted)]">
                  {completedCount}/{phaseTasks.length} objectives complete
                </span>
              </span>
              <span className="shrink-0 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">
                {isOpen ? "Collapse" : "Expand"}
              </span>
            </button>

            {isOpen ? (
              <div id={`timeline-phase-${month}`} className="border-t border-[var(--line)] px-4 pb-4 pt-3 sm:px-5">
                <div className="mb-3 h-2 rounded-full bg-[var(--surface)]">
                  <div
                    className="h-2 rounded-full bg-[var(--accent)]"
                    style={{ width: `${phaseTasks.length > 0 ? Math.round((completedCount / phaseTasks.length) * 100) : 0}%` }}
                  />
                </div>
                <div className="space-y-3">
              {phaseTasks.length === 0 && <p className="text-sm text-[var(--muted)]">No milestones in this phase.</p>}
              {phaseTasks.map((task) => {
                const completed = completedIds.has(task.id);
                return (
                  <TaskCard
                    key={task.id}
                    task={task}
                    checked={completed}
                    busy={savingId === task.id}
                    onToggle={(taskId) => void toggle(taskId)}
                    onOpen={setSelectedTask}
                  />
                );
              })}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}

      <TaskDrawer task={selectedTask} links={selectedLinks} onClose={() => setSelectedTask(null)} />
    </section>
  );
}
