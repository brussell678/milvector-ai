import type { DashboardLink, DashboardTask } from "./types";

function isExternal(href: string) {
  return href.startsWith("http://") || href.startsWith("https://");
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

  const sortedSupporting = [...(task.transition_supporting_tasks ?? [])].sort((a, b) => a.order_index - b.order_index);

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
        {task.assistance_notes && <p className="mt-2 text-xs text-[var(--muted)]">{task.assistance_notes}</p>}

        <section className="mt-5">
          <h4 className="font-semibold">Supporting Steps</h4>
          {sortedSupporting.length === 0 && <p className="mt-1 text-sm text-[var(--muted)]">No supporting steps for this objective.</p>}
          {sortedSupporting.length > 0 && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
              {sortedSupporting.map((step, idx) => (
                <li key={step.id ?? `${task.id}-${idx}`}>
                  <span className="font-medium text-[var(--fg)]">{step.title}</span>
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
          {links.length === 0 && <p className="mt-2 text-sm text-[var(--muted)]">No mapped library links for this category yet.</p>}
        </section>
      </aside>
    </div>
  );
}
