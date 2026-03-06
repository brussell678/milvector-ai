import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { extractTextFromPdfBuffer } from "@/lib/pdf";

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const { userId } = await requireUser();
  const supabase = supabaseServer();
  const documentId = ctx.params.id;

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

  const extracted = await extractTextFromPdfBuffer(buffer);

  if (!extracted || extracted.trim().length < 50) {
    // MVP: no OCR fallback; guide the user
    await supabase
      .from("documents")
      .update({ text_extracted: false, extracted_text: null })
      .eq("id", documentId)
      .eq("user_id", userId);

    return NextResponse.json({
      ok: false,
      error: "Could not extract text. Please upload a text-based PDF or paste the content into the tool.",
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