import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const supabase = await supabaseServer();
  const { id } = await params;

  const { data: submission, error: fetchError } = await supabase
    .from("library_submissions")
    .select("id,title,description,category,file_url,approved")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  if (submission.approved) return NextResponse.json({ ok: true, alreadyApproved: true });

  const { error: insertError } = await supabase.from("library_documents").insert({
    title: submission.title,
    description: submission.description,
    category: submission.category,
    file_url: submission.file_url,
    approved: true,
  });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { error: updateError } = await supabase
    .from("library_submissions")
    .update({ approved: true })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
