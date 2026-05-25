"use client";

import { useMemo, useState } from "react";
import { MissionStatus } from "./MissionStatus";
import { ReadinessScore } from "./ReadinessScore";
import { TaskCard } from "./TaskCard";
import { TaskDrawer } from "./TaskDrawer";
import { getTaskLinks } from "./task-linking";
import type { CategoryReadiness, DashboardLink, DashboardTask } from "./types";

const CATEGORY_WEIGHTS: Array<{ key: string; label: string; weight: number }> = [
  { key: "administrative", label: "Administrative", weight: 30 },
  { key: "employment", label: "Employment", weight: 30 },
  { key: "va benefits", label: "VA Benefits", weight: 20 },
  { key: "financial", label: "Financial", weight: 10 },
  { key: "education", label: "Education", weight: 10 },
];

function normalizeCategory(input: string | null) {
  return String(input ?? "").trim().toLowerCase();
}

function isFallbackTask(task: DashboardTask) {
  return task.id.startsWith("fallback:");
}

function inferCategory(task: DashboardTask): string {
  const direct = normalizeCategory(task.category);
  if (direct) return direct;

  const text = `${task.title} ${task.description ?? ""}`.toLowerCase();
  const tool = (task.tool_link ?? "").toLowerCase();

  if (tool.includes("resume") || tool.includes("jd-decoder") || tool.includes("mos-translator") || /resume|interview|job|network|skillbridge/.test(text)) return "employment";
  if (/gi bill|college|school|degree|education|certification|yellow ribbon/.test(text)) return "education";
  if (/va|bdd|vso|disability|medical|dental|tricare|deers|dd ?214|veteran/.test(text)) return "va benefits";
  if (/tsp|allotment|retired pay|dfas|financial|insurance|survivor benefit/.test(text)) return "financial";
  return "administrative";
}

function computeCategoryReadiness(allTasks: DashboardTask[], completedIds: Set<string>, educationProfileSignals: number): { categories: CategoryReadiness[]; readiness: number } {
  const categories = CATEGORY_WEIGHTS.map((category) => {
    const inCategory = allTasks.filter((task) => inferCategory(task) === category.key && !isFallbackTask(task));
    let total = inCategory.length;
    let completed = inCategory.filter((task) => completedIds.has(task.id)).length;

    if (category.key === "education" && educationProfileSignals > 0) {
      total = Math.max(total, 1);
      completed = Math.max(completed, 1);
    }

    const score = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { ...category, completed, total, score };
  });

  const active = categories.filter((category) => category.total > 0);
  const denominator = active.reduce((sum, category) => sum + category.weight, 0);
  const numerator = active.reduce((sum, category) => sum + category.weight * (category.score / 100), 0);
  const readiness = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;

  return { categories, readiness };
}

export function PhaseObjectives({
  currentPhase,
  daysUntilEas,
  nextObjective,
  phaseTasks,
  allMilestoneTasks,
  initialCompletedTaskIds,
  links,
  educationProfileSignals,
}: {
  currentPhase: string;
  daysUntilEas: number | null;
  nextObjective: { href: string; label: string };
  phaseTasks: DashboardTask[];
  allMilestoneTasks: DashboardTask[];
  initialCompletedTaskIds: string[];
  links: DashboardLink[];
  educationProfileSignals: number;
}) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set(initialCompletedTaskIds));
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<DashboardTask | null>(null);

  const readiness = useMemo(
    () => computeCategoryReadiness(allMilestoneTasks, completedIds, educationProfileSignals),
    [allMilestoneTasks, completedIds, educationProfileSignals]
  );

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
  const openPhaseTasks = phaseTasks.filter((task) => !completedIds.has(task.id));
  const completedPhaseTasks = phaseTasks.filter((task) => completedIds.has(task.id));
  const fallbackCount = phaseTasks.filter(isFallbackTask).length;

  return (
    <section className="space-y-4">
      <MissionStatus
        currentPhase={currentPhase}
        daysUntilEas={daysUntilEas}
        readiness={readiness.readiness}
        nextObjective={nextObjective}
      />
      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold">Recommended Objectives</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Phase: {currentPhase}</p>
            </div>
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted)]">
              <p>Open: {openPhaseTasks.length}</p>
              <p>Completed: {completedPhaseTasks.length}</p>
            </div>
          </div>

          {fallbackCount > 0 && (
            <section className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
              These retirement-source milestones are now visible, but completion tracking is still in reference mode until the timeline tasks are reseeded in Supabase.
            </section>
          )}

          <div className="mt-4 space-y-3">
            {openPhaseTasks.length === 0 && <p className="text-sm text-[var(--muted)]">No open objectives in this phase right now.</p>}
            {openPhaseTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                checked={completedIds.has(task.id)}
                busy={savingId === task.id}
                onToggle={(taskId) => void toggle(taskId)}
                onOpen={setSelectedTask}
              />
            ))}
          </div>

          {completedPhaseTasks.length > 0 && (
            <details className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
              <summary className="cursor-pointer text-sm font-semibold">Completed in this phase ({completedPhaseTasks.length})</summary>
              <div className="mt-3 space-y-3">
                {completedPhaseTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    checked={completedIds.has(task.id)}
                    busy={savingId === task.id}
                    onToggle={(taskId) => void toggle(taskId)}
                    onOpen={setSelectedTask}
                  />
                ))}
              </div>
            </details>
          )}
        </section>
        <ReadinessScore readiness={readiness.readiness} categories={readiness.categories} />
      </section>

      <TaskDrawer task={selectedTask} links={selectedLinks} onClose={() => setSelectedTask(null)} />
    </section>
  );
}
