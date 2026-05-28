import { redirect } from "next/navigation";
import { ReactNode } from "react";
import Image from "next/image";
import { AppNav } from "@/components/app-nav";
import { AppShell } from "@/components/layout/app-shell";
import { MobileAppNav } from "@/components/layout/mobile-app-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { isAdminEmail } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");
  const isAdmin = isAdminEmail(user.email);
  const notificationsCountRes = await supabase
    .from("message_board_notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);
  const unreadBoardNotifications = notificationsCountRes.error ? 0 : notificationsCountRes.count ?? 0;

  return (
    <AppShell>
      <header className="panel mb-4 flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <Image
            src="/assets/milvector-ai-logo-transparent.png"
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ThemeToggle />
          <form action="/api/auth/signout" method="post">
            <button className="btn btn-secondary w-full text-sm sm:w-auto" type="submit">
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <MobileAppNav isAdmin={isAdmin} unreadBoardNotifications={unreadBoardNotifications} />

      <section className="panel mb-6 hidden p-3 md:block">
        <AppNav isAdmin={isAdmin} unreadBoardNotifications={unreadBoardNotifications} />
      </section>

      {children}
    </AppShell>
  );
}
