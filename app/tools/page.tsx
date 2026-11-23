import Link from "next/link";
import type { Metadata } from "next";
import { PageContainer } from "@/components/layout/page-container";
import { pageMetadata } from "@/lib/seo";
import { supabaseServer } from "@/lib/supabase/server";
import { previewEnabled, toolLinkVisible } from "@/lib/tools/preview";
import { toolGroups, type ToolCard } from "@/lib/tools/registry";

export const metadata: Metadata = pageMetadata({
  title: "Free Tools for the Military Transition",
  description:
    "Every MilVector tool in one place: resumes from your military records, job targeting, LinkedIn, interview prep, retirement pay, VA ratings, SBP, and your retirement invitation. Free for service members.",
  path: "/tools",
});

// The public view of the Tools hub, rendered from the same registry, so a
// visitor sees what each tool does before making an account. A tool's button
// goes to sign-up and lands on that tool afterwards; a signed-in member goes
// straight in.

const signUpFor = (href: string) => `/auth?mode=signup&next=${encodeURIComponent(href)}`;

function ToolCardPublic({ tool, signedIn }: { tool: ToolCard; signedIn: boolean }) {
  // A tool with a public page opens there for visitors; members go to the workspace copy.
  const noAccount = !!tool.publicHref;
  const href = signedIn ? tool.href : (tool.publicHref ?? signUpFor(tool.href));
  const label = noAccount ? "Open the calculator" : signedIn ? "Open tool" : "Start free";
  return (
    <article className="subtle-panel flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-bold leading-tight">{tool.title}</h3>
        <span className="tool-badge tool-badge-success" style={{ fontSize: "0.65rem" }}>
          {noAccount ? "No account needed" : "Free with an account"}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-[var(--muted)]">{tool.desc}</p>
      <div className="mt-auto pt-1">
        <Link href={href} className={noAccount || signedIn ? "btn btn-secondary text-sm" : "btn btn-primary text-sm"}>
          {label}
        </Link>
      </div>
    </article>
  );
}

export default async function PublicToolsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = !!user;

  const groups = toolGroups
    .map((group) => ({ ...group, tools: group.tools.filter((tool) => (tool.isPreview ? previewEnabled(tool.href, null) : toolLinkVisible(tool.href, null))) }))
    .filter((group) => group.tools.length > 0);
  const count = groups.reduce((n, group) => n + group.tools.length, 0);

  return (
    <PageContainer className="flex flex-col gap-8" size="lg">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div>
            <p className="page-kicker-pill">TOOLS</p>
            <h1 className="page-title">
              {count} free tools for your <span className="gradient-text">transition.</span>
            </h1>
            <p className="page-description">
              Build a resume from your military records, aim it at real jobs, prepare for interviews, and make the big retirement calls with your
              own numbers. Built for service members, and free.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {signedIn ? (
                <Link href="/app/tools" className="btn btn-primary w-full sm:w-auto">
                  Open your tools
                </Link>
              ) : (
                <>
                  <Link href={signUpFor("/app/tools")} className="btn btn-primary w-full sm:w-auto">
                    Create your free account
                  </Link>
                  <Link href="/auth?next=%2Fapp%2Ftools" className="btn btn-hero-ghost w-full sm:w-auto">
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
          <aside className="page-hero-aside">
            <p className="page-hero-aside-title">WHAT AN ACCOUNT GETS YOU</p>
            <ul className="page-hero-list">
              <li>Every tool, free</li>
              <li>Your records and results saved in one place</li>
              <li>A Timeline of tasks counting down to your date</li>
              <li>Delete your account and everything in it at any time</li>
            </ul>
          </aside>
        </div>
      </section>

      {groups.map((group) => (
        <section key={group.kicker} className="section-card">
          <p className="section-kicker">{group.kicker}</p>
          <h2 className="section-title mt-1">{group.title}</h2>
          <p className="section-description">{group.description}</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {group.tools.map((tool) => (
              <ToolCardPublic key={tool.href} tool={tool} signedIn={signedIn} />
            ))}
          </div>
        </section>
      ))}
    </PageContainer>
  );
}
