"use client";

import { useMemo, useState } from "react";

type SupportingTask = {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
};

type TransitionTask = {
  id: string;
  title: string;
  description: string | null;
  tool_link: string | null;
  knowledge_article: string | null;
  assistance_type: "tool" | "doc" | "none";
  assistance_ref: string | null;
  assistance_notes: string | null;
  transition_supporting_tasks: SupportingTask[];
};

function assistanceLabel(type: TransitionTask["assistance_type"]) {
  if (type === "tool") return "Assisted: Tool";
  if (type === "doc") return "Assisted: File";
  return "No direct assist";
}

export function TransitionTaskList({
  tasks,
  initialCompletedTaskIds,
}: {
  tasks: TransitionTask[];
  initialCompletedTaskIds: string[];
}) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set(initialCompletedTaskIds));
  const [savingId, setSavingId] = useState<string | null>(null);

  const readiness = useMemo(() => {
    if (!tasks.length) return 0;
    return Math.round((tasks.filter((t) => completedIds.has(t.id)).length / tasks.length) * 100);
  }, [completedIds, tasks]);

  async function toggle(taskId: string) {
    const nextCompleted = !completedIds.has(taskId);
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

    if (!res.ok) {
      setCompletedIds(new Set(completedIds));
    }
    setSavingId(null);
  }

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">Task List</h2>
        <p className="text-sm font-semibold text-[var(--accent)]">Transition Readiness: {readiness}%</p>
      </div>
      <div className="mt-3 space-y-3">
        {tasks.length === 0 && <p className="text-sm text-[var(--muted)]">No tasks configured for this phase yet.</p>}
        {tasks.map((task) => {
          const checked = completedIds.has(task.id);
          const supporting = [...(task.transition_supporting_tasks ?? [])].sort((a, b) => a.order_index - b.order_index);
          return (
            <article key={task.id} className="rounded-md border border-[var(--line)] p-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  onChange={() => void toggle(task.id)}
                  disabled={savingId === task.id}
                />
                <div className="w-full">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{task.title}</p>
                    <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                      {assistanceLabel(task.assistance_type)}
                    </span>
                  </div>
                  {task.description && <p className="mt-1 text-sm text-[var(--muted)]">{task.description}</p>}
                  {task.assistance_notes && <p className="mt-1 text-xs text-[var(--muted)]">{task.assistance_notes}</p>}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {task.tool_link && (
                      <a href={task.tool_link} className="btn btn-secondary !py-1">
                        Open Tool
                      </a>
                    )}
                    {task.knowledge_article && (
                      <a href={task.knowledge_article} className="btn btn-secondary !py-1">
                        Read Article
                      </a>
                    )}
                    {task.assistance_ref && (
                      <a href={task.assistance_ref} className="btn btn-secondary !py-1" target="_blank" rel="noopener noreferrer">
                        Open Assistance
                      </a>
                    )}
                  </div>
                  {supporting.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-[var(--accent)]">Supporting steps ({supporting.length})</summary>
                      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-[var(--muted)]">
                        {supporting.map((item) => (
                          <li key={item.id ?? `${task.id}-${item.order_index}`}>
                            <span className="font-medium text-[var(--fg)]">{item.title}</span>
                            {item.description ? ` - ${item.description}` : ""}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </div>
              </label>
            </article>
          );
        })}
      </div>
    </section>
  );
}
