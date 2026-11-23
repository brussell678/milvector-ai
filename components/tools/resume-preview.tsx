import type { TargetedRole } from "@/lib/resume/build";
import type { BuildResult } from "@/lib/resume/build-result";

// A built targeted resume as text on screen, shared by the classic builder
// and the chat. The Word file is the real thing; this is for reading it over.

function RoleBlock({ role }: { role: TargetedRole }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-bold">{role.title}</p>
      {(role.organization || role.dates) && <p className="text-xs italic text-[var(--muted)]">{[role.organization, role.dates].filter(Boolean).join(" | ")}</p>}
      <ul className="mt-1.5 grid gap-1.5">
        {role.bullets.map((b, i) => (
          <li key={i} className="text-sm">
            • {b.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResumePreview({ resume }: { resume: BuildResult["resume"] }) {
  const extras = [...resume.education, ...resume.certifications, ...resume.training];
  return (
    <div className="tool-resume-preview">
      {resume.targetTitle && <p className="font-bold">{resume.targetTitle}</p>}
      {resume.tagline && <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{resume.tagline}</p>}
      {resume.summary && <p className="mt-2 text-sm">{resume.summary}</p>}
      {resume.skills.length > 0 && <p className="mt-2 text-sm text-[var(--muted)]">{resume.skills.join(" | ")}</p>}
      {(resume.highlights ?? []).map((group) => (
        <div key={group.heading} className="mt-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{group.heading}</p>
          <ul className="mt-1.5 grid gap-1.5">
            {group.bullets.map((b, i) => (
              <li key={i} className="text-sm">
                • {b.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {resume.jobs.map((role) => (
        <RoleBlock key={role.roleId} role={role} />
      ))}
      {resume.projects.length > 0 && (
        <>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">Selected projects</p>
          {resume.projects.map((role) => (
            <RoleBlock key={role.roleId} role={role} />
          ))}
        </>
      )}
      {extras.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-bold">Education and professional development</p>
          <ul className="mt-1 grid gap-1 text-sm">
            {extras.map((item, i) => (
              <li key={i}>• {item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
