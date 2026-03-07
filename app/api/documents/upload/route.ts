import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { guessMimeFromExtension, isAllowedDocumentFile } from "@/lib/documents";

const MAX_MB = Number(process.env.MAX_UPLOAD_MB ?? "10");

export async function POST(req: Request) {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (!isAllowedDocumentFile(file)) {
    return NextResponse.json({ error: "Allowed formats: .pdf, .doc, .docx, .txt, .md" }, { status: 400 });
  }

  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_MB) {
    return NextResponse.json({ error: `File too large (max ${MAX_MB}MB)` }, { status: 400 });
  }

  const docType = (form.get("doc_type") as string) ?? "FITREP";
  if (!["FITREP", "EVAL", "VMET", "JST", "MASTER_RESUME", "RESUME_TEMPLATE", "OTHER"].includes(docType)) {
    return NextResponse.json({ error: "Invalid doc_type" }, { status: 400 });
  }

  const documentId = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
  const storagePath = `${userId}/${documentId}/${safeName}`;
  const mimeType = guessMimeFromExtension(file.name, file.type);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Insert DB record
  const { data, error } = await supabase
    .from("documents")
    .insert({
      id: documentId,
      user_id: userId,
      doc_type: docType,
      filename: file.name,
      storage_path: storagePath,
      mime_type: mimeType,
      size_bytes: file.size,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ documentId: data.id });
}
