import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

// Admin takedown switch for a reported card. The database trigger lets only
// the admin change the suspended flag, so this route is a convenience, not
// the control.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { suspended?: unknown } | null;
  if (typeof body?.suspended !== "boolean") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { data, error } = await supabase.from("business_cards").update({ suspended: body.suspended }).eq("id", id).select("id,suspended").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, suspended: data.suspended });
}
