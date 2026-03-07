import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

type BulkPayload = {
  action?: "delete" | "duplicate";
  ids?: string[];
};

export async function POST(req: Request) {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();
  const body = (await req.json().catch(() => ({}))) as BulkPayload;
  const action = body.action;
  const ids = (body.ids ?? []).filter((id) => typeof id === "string" && id.length > 0);

  if (!action || !["delete", "duplicate"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  if (ids.length === 0 || ids.length > 50) {
    return NextResponse.json({ error: "Provide 1-50 artifact ids" }, { status: 400 });
  }

  if (action === "delete") {
    const { error } = await supabase
      .from("resume_artifacts")
      .delete()
      .eq("user_id", userId)
      .in("id", ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action, count: ids.length });
  }

  const { data: sourceRows, error: sourceErr } = await supabase
    .from("resume_artifacts")
    .select("artifact_type,title,content,source_document_id,job_title_target,company_target,job_description")
    .eq("user_id", userId)
    .in("id", ids);

  if (sourceErr) return NextResponse.json({ error: sourceErr.message }, { status: 500 });
  if (!sourceRows?.length) return NextResponse.json({ error: "No artifacts found" }, { status: 404 });

  const copies = sourceRows.map((row) => ({
    user_id: userId,
    artifact_type: row.artifact_type,
    title: `${row.title} (Copy)`,
    content: row.content,
    source_document_id: row.source_document_id,
    job_title_target: row.job_title_target,
    company_target: row.company_target,
    job_description: row.job_description,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("resume_artifacts")
    .insert(copies)
    .select("id");

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, action, count: inserted?.length ?? 0 });
}

