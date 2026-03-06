import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { ProfileUpsertSchema } from "@/lib/validators/profile";

export async function GET() {
  const { userId } = await requireUser();
  const supabase = supabaseServer();

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
  const supabase = supabaseServer();

  const body = await req.json();
  const parsed = ProfileUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;

  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      ...payload,
      separation_date: payload.separation_date ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}