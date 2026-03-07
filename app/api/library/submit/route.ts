import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const MAX_MB = Number(process.env.MAX_UPLOAD_MB ?? "10");

export async function POST(req: Request) {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();

  const form = await req.formData();
  const title = (form.get("title")?.toString() ?? "").trim();
  const description = (form.get("description")?.toString() ?? "").trim();
  const category = (form.get("category")?.toString() ?? "General").trim();
  const file = form.get("file");

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });

  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_MB) {
    return NextResponse.json({ error: `File too large (max ${MAX_MB}MB)` }, { status: 400 });
  }

  const submissionId = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
  const storagePath = `${userId}/${submissionId}/${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("library-submissions")
    .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream", upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { error } = await supabase.from("library_submissions").insert({
    id: submissionId,
    title,
    description: description || null,
    category,
    file_url: storagePath,
    submitted_by: userId,
    approved: false,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, submissionId });
}