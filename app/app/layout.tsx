import { redirect } from "next/navigation";
import { ReactNode } from "react";
import Image from "next/image";
import { AppNav } from "@/components/app-nav";
import { AppShell } from "@/components/layout/app-shell";
import { MobileAppNav } from "@/components/layout/mobile-app-nav";
import { AnnouncementBar, type AnnouncementUpdate } from "@/components/announcement-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { isAdminEmail } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

// Only surface the bar for genuinely recent updates. When it's been dry, the
// bar is simply absent — no stale "last updated months ago" nag. The full
// dated record still lives on the What's New page.
const ANNOUNCEMENT_WINDOW_DAYS = 21;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");
  const isAdmin = isAdminEmail(user.email);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [notificationsCountRes, toolRunsRes] = await Promise.all([
    supabase
      .from("message_board_notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
    supabase
      .from("tool_runs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", sevenDaysAgo),
  ]);
  const unreadBoardNotifications = notificationsCountRes.error ? 0 : notificationsCountRes.count ?? 0;
  const hasRecentToolActivity = !toolRunsRes.error && (toolRunsRes.count ?? 0) > 0;

  const announcementCutoff = new Date(Date.now() - ANNOUNCEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: latestUpdate } = await supabase
    .from("product_updates")
    .select("id,title,category,is_user_requested,published_at")
    .eq("published", true)
    .gte("published_at", announcementCutoff)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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
          <a href="/app/profile" className="btn btn-secondary hidden text-sm sm:inline-flex sm:w-auto">
            Profile
          </a>
          <form action="/api/auth/signout" method="post">
            <button className="btn btn-secondary w-full text-sm sm:w-auto" type="submit">
              Sign Out
            </button>
          </form>
        </div>
      </header>

      <AnnouncementBar update={(latestUpdate as AnnouncementUpdate | null) ?? null} />

      <MobileAppNav isAdmin={isAdmin} unreadBoardNotifications={unreadBoardNotifications} hasRecentToolActivity={hasRecentToolActivity} />

      <section className="panel mb-6 hidden p-3 md:block">
        <AppNav isAdmin={isAdmin} unreadBoardNotifications={unreadBoardNotifications} hasRecentToolActivity={hasRecentToolActivity} />
      </section>

      {children}
    </AppShell>
  );
}
