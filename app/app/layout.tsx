import { redirect } from "next/navigation";
import { ReactNode } from "react";
import Image from "next/image";
import { AppNav } from "@/components/app-nav";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 md:px-8">
      <header className="panel mb-6 flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/assets/the-next-mission-logo.svg"
            alt="The Next Mission logo"
            width={48}
            height={48}
            className="rounded-xl object-contain ring-1 ring-[var(--line)]"
          />
          <div>
          <p className="text-xs font-semibold tracking-wider text-[var(--accent)]">THE NEXT MISSION</p>
          <p className="text-sm text-[var(--muted)]">{user.email}</p>
          </div>
        </div>
        <AppNav />
        <form action="/api/auth/signout" method="post">
          <button className="btn btn-secondary text-sm" type="submit">
            Sign Out
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
