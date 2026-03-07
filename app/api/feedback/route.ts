import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

const FeedbackSchema = z.object({
  name: z.string().max(120).optional().nullable(),
  email: z.string().email().optional().nullable(),
  branch: z.string().max(80).optional().nullable(),
  mos: z.string().max(80).optional().nullable(),
  feedback_type: z.enum(["bug", "suggestion", "general", "tool_request"]),
  message: z.string().min(10).max(4000),
  suggested_tool: z.string().max(200).optional().nullable(),
});

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const form = await req.formData();
  const parsed = FeedbackSchema.safeParse({
    name: form.get("name")?.toString() || null,
    email: form.get("email")?.toString() || null,
    branch: form.get("branch")?.toString() || null,
    mos: form.get("mos")?.toString() || null,
    feedback_type: form.get("feedback_type")?.toString(),
    message: form.get("message")?.toString(),
    suggested_tool: form.get("suggested_tool")?.toString() || null,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await supabase.from("feedback").insert({
    user_id: user?.id ?? null,
    ...parsed.data,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}