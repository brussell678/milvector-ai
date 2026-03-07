import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await supabaseServer();

  const [documentsRes, linksRes] = await Promise.all([
    supabase
      .from("library_documents")
      .select("id,title,description,category,file_url,created_at")
      .eq("approved", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("library_links")
      .select("id,title,description,category,url,created_at")
      .order("created_at", { ascending: false }),
  ]);

  if (documentsRes.error) return NextResponse.json({ error: documentsRes.error.message }, { status: 500 });
  if (linksRes.error) return NextResponse.json({ error: linksRes.error.message }, { status: 500 });

  return NextResponse.json({
    documents: documentsRes.data ?? [],
    links: linksRes.data ?? [],
  });
}