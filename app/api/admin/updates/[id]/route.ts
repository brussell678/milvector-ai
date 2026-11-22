import { NextResponse } from "next/server";
import { authReplies, requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

async function handleDELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const supabase = await supabaseServer();
  const { id } = await params;

  const { error } = await supabase.from("product_updates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const DELETE = authReplies(handleDELETE);
