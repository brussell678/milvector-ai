import { NextResponse } from "next/server";
import { sendDueNotices } from "@/lib/admin/notices";
import { supabaseAdmin } from "@/lib/supabase/admin";

// The daily retention job (vercel.json): sends the clearing notices that are
// due (lib/admin/notices.ts). Vercel calls it with "Authorization: Bearer
// <CRON_SECRET>"; nobody else can. It never clears anything.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set." }, { status: 503 });
  const run = await sendDueNotices(admin);
  if (!run.ok) console.error("[cron] retention:", run.error);
  else if (run.notSent.length) console.error("[cron] retention notices not sent:", run.notSent.join(" | "));
  return NextResponse.json(run, { status: run.ok ? 200 : 503 });
}
