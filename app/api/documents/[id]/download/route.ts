import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await requireUser();
  const { id } = await ctx.params;
  const supabase = await supabaseServer();

  const { data: doc, error } = await supabase
    .from("documents")
    .select("id,filename,mime_type,storage_path")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
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
