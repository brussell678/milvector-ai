import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const CompletionSchema = z.object({
  taskId: z.string().uuid(),
  completed: z.boolean(),
});

export async function GET() {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("transition_task_completions")
    .select("task_id")
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ completedTaskIds: (data ?? []).map((x) => x.task_id) });
}

export async function POST(req: Request) {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();

  const body = await req.json();
  const parsed = CompletionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.completed) {
    const { error } = await supabase
      .from("transition_task_completions")
      .upsert({ user_id: userId, task_id: parsed.data.taskId })
      .select("task_id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("transition_task_completions")
    .delete()
    .eq("user_id", userId)
    .eq("task_id", parsed.data.taskId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}