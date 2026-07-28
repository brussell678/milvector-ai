import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { notifyUserRequestShipped } from "@/lib/email";

const CreateUpdateSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(10).max(4000),
  category: z.enum(["new", "improvement", "fix"]).default("improvement"),
  is_user_requested: z.boolean().optional().default(false),
  linked_feedback_id: z.string().uuid().optional().nullable(),
  published: z.boolean().optional().default(true),
});

export async function GET() {
  await requireAdmin();
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("product_updates")
    .select("id,title,body,category,is_user_requested,linked_feedback_id,published,published_at,created_at")
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updates: data ?? [] });
}

export async function POST(req: Request) {
  await requireAdmin();
  const supabase = await supabaseServer();

  const parsed = CreateUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid update." }, { status: 400 });
  }

  const { title, body, category, is_user_requested, linked_feedback_id, published } = parsed.data;

  const { data: created, error } = await supabase
    .from("product_updates")
    .insert({
      title,
      body,
      category,
      is_user_requested: is_user_requested || !!linked_feedback_id,
      linked_feedback_id: linked_feedback_id ?? null,
      published,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Close the loop: mark the linked case resolved and tell the original reporter.
  if (published && linked_feedback_id) {
    const { data: ticket } = await supabase
      .from("feedback")
      .select("email, message")
      .eq("id", linked_feedback_id)
      .single();

    await supabase.from("feedback").update({ status: "resolved" }).eq("id", linked_feedback_id);

    if (ticket?.email) {
      void notifyUserRequestShipped({
        to: ticket.email,
        ticketMessage: ticket.message ?? "",
        updateTitle: title,
        updateBody: body,
      }).catch((err) => console.error("Request-shipped notify failed", err));
    }
  }

  return NextResponse.json({ id: created.id, ok: true });
}
