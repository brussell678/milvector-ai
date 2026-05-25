import { NextResponse } from "next/server";
import { syncAuthenticatedProfile } from "@/lib/auth-profile";
import { supabaseServer } from "@/lib/supabase/server";
import { AuthProfileSyncSchema } from "@/lib/validators/profile";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = AuthProfileSyncSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await syncAuthenticatedProfile(supabase, user, parsed.data);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

