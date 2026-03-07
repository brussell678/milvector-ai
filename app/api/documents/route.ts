import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();
  const url = new URL(req.url);
  const includeText = url.searchParams.get("includeText") === "1";

  const selectFields = includeText
    ? "id,doc_type,filename,mime_type,size_bytes,text_extracted,created_at,updated_at,extracted_text"
    : "id,doc_type,filename,mime_type,size_bytes,text_extracted,created_at,updated_at";

  const { data, error } = await supabase
    .from("documents")
    .select(selectFields)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ documents: data ?? [] });
}
