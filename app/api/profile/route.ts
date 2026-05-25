import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { ProfileUpsertSchema } from "@/lib/validators/profile";

export async function GET() {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data ?? null });
}

export async function POST(req: Request) {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();

  const body = await req.json();
  const parsed = ProfileUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const profilePayload = {
    id: userId,
    ...payload,
    eas_date: payload.eas_date ?? null,
    separation_date: payload.eas_date ?? null,
  };

  if ("terminal_leave_start" in payload) {
    Object.assign(profilePayload, { terminal_leave_start: payload.terminal_leave_start ?? null });
  }
  if ("ptad_start" in payload) {
    Object.assign(profilePayload, { ptad_start: payload.ptad_start ?? null });
  }
  if ("retirement_ceremony_date" in payload) {
    Object.assign(profilePayload, { retirement_ceremony_date: payload.retirement_ceremony_date ?? null });
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(profilePayload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
