import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import {
  buildTargetedResumeFilename,
  renderTargetedResumeDocx,
  StructuredTargetedResume,
} from "@/lib/resume-template";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await requireUser();
  const { id } = await ctx.params;
  const supabase = await supabaseServer();

  const { data: doc, error } = await supabase
    .from("documents")
    .select("id,filename,mime_type,storage_path,created_at,doc_type")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (doc.doc_type === "TARGETED_RESUME") {
    const { data: artifact } = await supabase
      .from("resume_artifacts")
      .select("created_at,structured_output,job_title_target,company_target")
      .eq("rendered_document_id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (artifact?.structured_output) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name,phone_number,professional_email,linkedin_url,location,location_pref,security_clearance")
        .eq("id", userId)
        .maybeSingle();

      const buffer = await renderTargetedResumeDocx({
        contact: {
          full_name: profile?.full_name ?? null,
          phone_number: profile?.phone_number ?? null,
          professional_email: profile?.professional_email ?? null,
          linkedin_url: profile?.linkedin_url ?? null,
          location: profile?.location ?? profile?.location_pref ?? null,
          security_clearance: profile?.security_clearance ?? null,
        },
        resume: artifact.structured_output as StructuredTargetedResume,
      });

      const bytes = new Uint8Array(buffer);
      const filename = buildTargetedResumeFilename({
        createdAt: new Date(artifact.created_at ?? doc.created_at),
        jobTitle: artifact.job_title_target ?? doc.filename,
        company: artifact.company_target ?? null,
      });

      return new NextResponse(bytes, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }
  }

  const { data: file, error: downloadError } = await supabase.storage.from("documents").download(doc.storage_path);
  if (downloadError || !file) {
    return NextResponse.json({ error: downloadError?.message ?? "Download failed" }, { status: 500 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": doc.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${doc.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}