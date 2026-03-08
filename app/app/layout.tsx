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
      <header className="panel mb-4 flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <Image
            src="/assets/milvector-ai-logo.svg"
            alt="MILVECTOR AI logo"
            width={48}
            height={48}
            className="object-contain"
          />
          <div>
            <p className="text-xs font-semibold tracking-wider text-[var(--accent)]">MILVECTOR AI</p>
            <p className="text-sm text-[var(--muted)]">{user.email}</p>
          </div>
        </div>
        <form action="/api/auth/signout" method="post">
          <button className="btn btn-secondary text-sm" type="submit">
            Sign Out
          </button>
        </form>
      </header>

      <section className="panel mb-6 p-3">
        <AppNav />
      </section>

      {children}
    </div>
  );
}
