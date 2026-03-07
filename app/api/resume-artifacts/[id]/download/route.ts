import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
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
    .select("id,title,artifact_type,created_at,content")
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
