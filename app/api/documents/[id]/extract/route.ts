import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { extractTextFromDocumentBuffer } from "@/lib/documents";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();
  const { id: documentId } = await ctx.params;

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (docErr) return NextResponse.json({ error: docErr.message }, { status: 404 });

  const { data: download, error: dlErr } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);

  if (dlErr || !download) {
    return NextResponse.json({ error: dlErr?.message ?? "Download failed" }, { status: 500 });
  }

  const arrayBuffer = await download.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let extracted = "";
  try {
    extracted = await extractTextFromDocumentBuffer({
      buffer,
      filename: doc.filename,
      mimeType: doc.mime_type,
    });
  } catch (error) {
    await supabase
      .from("documents")
      .update({ text_extracted: false, extracted_text: null })
      .eq("id", documentId)
      .eq("user_id", userId);

    const message = error instanceof Error ? error.message : "Could not extract text from this file type.";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }

  if (!extracted || extracted.trim().length < 50) {
    // MVP: no OCR fallback; guide the user
    await supabase
      .from("documents")
      .update({ text_extracted: false, extracted_text: null })
      .eq("id", documentId)
      .eq("user_id", userId);

    return NextResponse.json({
      ok: false,
      error: "Could not extract text. Upload a text-based file (.pdf, .docx, .txt, .md) or paste content manually.",
    }, { status: 200 });
  }

  const { error: upErr } = await supabase
    .from("documents")
    .update({ text_extracted: true, extracted_text: extracted })
    .eq("id", documentId)
    .eq("user_id", userId);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
