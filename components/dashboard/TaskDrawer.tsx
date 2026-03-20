import type { DashboardLink, DashboardTask } from "./types";

function isExternal(href: string) {
  return href.startsWith("http://") || href.startsWith("https://");
}

function buildRequirements(task: DashboardTask) {
  const supporting = [...(task.transition_supporting_tasks ?? [])].sort((a, b) => a.order_index - b.order_index);
  if (supporting.length > 0) {
    return supporting.map((step) => ({
      title: step.title,
      description: step.description,
      key: `${step.id ?? step.title}-${step.order_index}`,
    }));
  }

  const derived: Array<{ title: string; description: string | null; key: string }> = [];

  if (task.description) {
    derived.push({ title: "Primary requirement", description: task.description, key: "derived-primary" });
  }

  if (typeof task.days_before_event === "number") {
    derived.push({
      title: "Timing",
      description: `Plan to complete this about ${task.days_before_event} days before its anchor event.`,
      key: "derived-timing",
    });
  }

  if (task.assistance_notes) {
    derived.push({ title: "MilVector guidance", description: task.assistance_notes, key: "derived-assistance" });
  }

  return derived;
}

export function TaskDrawer({
  task,
  links,
  onClose,
}: {
  task: DashboardTask | null;
  links: DashboardLink[];
  onClose: () => void;
}) {
  if (!task) return null;

  const requirements = buildRequirements(task);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 p-2 sm:p-4">
      <aside className="panel h-full w-full max-w-2xl overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-[var(--accent)]">TASK DETAIL</p>
            <h3 className="mt-1 text-xl font-bold">{task.title}</h3>
          </div>
          <button className="btn btn-secondary !py-1 text-xs" onClick={onClose} type="button">
            Close
          </button>
        </div>

        {task.description && <p className="mt-3 text-sm text-[var(--muted)]">{task.description}</p>}

        <section className="mt-5">
          <h4 className="font-semibold">Requirements / Actions</h4>
          {requirements.length === 0 && <p className="mt-1 text-sm text-[var(--muted)]">No requirements listed for this objective yet.</p>}
          {requirements.length > 0 && (
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
              {requirements.map((step) => (
                <li key={step.key}>
                  <span className="font-medium text-[var(--foreground)]">{step.title}</span>
                  {step.description ? ` - ${step.description}` : ""}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="mt-5">
          <h4 className="font-semibold">Recommended Resources</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {task.assistance_ref && (
              <a
                href={task.assistance_ref}
                className="btn btn-secondary !py-1 text-xs"
                target={isExternal(task.assistance_ref) ? "_blank" : undefined}
                rel={isExternal(task.assistance_ref) ? "noopener noreferrer" : undefined}
              >
                Open Assistance
              </a>
            )}
            {task.tool_link && (
              <a href={task.tool_link} className="btn btn-secondary !py-1 text-xs">
                Open Related Tool
              </a>
            )}
            {task.knowledge_article && (
              <a href={task.knowledge_article} className="btn btn-secondary !py-1 text-xs">
                Read Knowledge Article
              </a>
            )}
          </div>
          {links.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">
              {links.map((link) => (
                <li key={link.id}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">
                    {link.title}
                  </a>
                  {link.description && <p className="text-xs text-[var(--muted)]">{link.description}</p>}
                </li>
              ))}
            </ul>
          )}
          {links.length === 0 && <p className="mt-2 text-sm text-[var(--muted)]">No mapped library links for this objective yet.</p>}
        </section>
      </aside>
    </div>
  );
}
