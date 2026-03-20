import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getLibraryLinkFallbacks, mergeLibraryLinks } from "@/lib/transition-data";

export async function GET() {
  const supabase = await supabaseServer();

  const [documentsRes, linksRes, fallbackLinks] = await Promise.all([
    supabase
      .from("library_documents")
      .select("id,title,description,category,file_url,created_at")
      .eq("approved", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("library_links")
      .select("id,external_id,title,description,category,url,source,review_status,created_at")
      .eq("review_status", "ready")
      .order("created_at", { ascending: false }),
    getLibraryLinkFallbacks(),
  ]);

  if (documentsRes.error) return NextResponse.json({ error: documentsRes.error.message }, { status: 500 });
  if (linksRes.error) return NextResponse.json({ error: linksRes.error.message }, { status: 500 });

  return NextResponse.json({
    documents: documentsRes.data ?? [],
    links: mergeLibraryLinks(linksRes.data ?? [], fallbackLinks),
  });
}
