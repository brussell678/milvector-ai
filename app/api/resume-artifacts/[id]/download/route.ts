import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import {
  buildTargetedResumeFilename,
  renderTargetedResumeDocx,
  StructuredTargetedResume,
} from "@/lib/resume-template";
import { Document, Packer, Paragraph, TextRun } from "docx";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const reqUrl = new URL(_req.url);
  const format = reqUrl.searchParams.get("format") === "docx" ? "docx" : "txt";
  const { userId } = await requireUser();
  const { id } = await ctx.params;
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("resume_artifacts")
    .select("id,title,artifact_type,created_at,content,structured_output,rendered_document_id,job_title_target,company_target")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  const createdAt = new Date(data.created_at).toISOString();
  const text = [
    `Title: ${data.title}`,
    `Type: ${data.artifact_type}`,
    `Created: ${createdAt}`,
    "",
    data.content,
  ].join("\n");

  const baseName = slugify(data.title || `artifact-${data.id}`) || `artifact-${data.id}`;

  if (format === "docx") {
    if (data.rendered_document_id) {
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .select("filename,mime_type,storage_path")
        .eq("id", data.rendered_document_id)
        .eq("user_id", userId)
        .maybeSingle();

      if (!docError && doc) {
        const { data: file, error: downloadError } = await supabase.storage.from("documents").download(doc.storage_path);
        if (!downloadError && file) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          return new NextResponse(bytes, {
            headers: {
              "Content-Type": doc.mime_type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "Content-Disposition": `attachment; filename="${doc.filename}"`,
              "Cache-Control": "no-store",
            },
          });
        }
      }
    }

    if (data.artifact_type === "targeted_resume" && data.structured_output) {
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
        resume: data.structured_output as StructuredTargetedResume,
      });
      const bytes = new Uint8Array(buffer);
      const filename = buildTargetedResumeFilename({
        createdAt: new Date(data.created_at),
        jobTitle: data.job_title_target ?? data.title,
        company: data.company_target ?? null,
      });
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const paragraphs = text.split("\n").map((line) => new Paragraph({ children: [new TextRun(line)] }));
    const doc = new Document({
      sections: [{ properties: {}, children: paragraphs }],
    });
    const buffer = await Packer.toBuffer(doc);
    const bytes = new Uint8Array(buffer);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${baseName}.docx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseName}.txt"`,
      "Cache-Control": "no-store",
    },
  });
}
