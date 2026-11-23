import { NextResponse } from "next/server";
import { z } from "zod";
import { authReplies, requireAdmin } from "@/lib/auth";
import { CHAT_TOOLS } from "@/lib/chat/tools";
import { supabaseServer } from "@/lib/supabase/server";

// Opens a tool's chat view to every member, or closes it back to the admin
// only (docs/CHAT_TOOLS_PLAN.md, Phase 6). Members see the change on their
// next page load; nothing is redeployed. Admin only, here and in the table's
// row policy (migration 0044).
const KEYS = Object.values(CHAT_TOOLS).map((tool) => tool.key) as [string, ...string[]];
const ChangeSchema = z.object({ tool: z.enum(KEYS), open: z.boolean() });
const NOT_READY = "The chat switches need migration 0044 run in Supabase first.";

async function handlePATCH(req: Request) {
  await requireAdmin();
  const parsed = ChangeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That is not a chat tool." }, { status: 400 });

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("chat_tool_access")
    .update({ open_to_members: parsed.data.open, updated_at: new Date().toISOString() })
    .eq("tool_key", parsed.data.tool)
    .select("tool_key,open_to_members,updated_at")
    .maybeSingle();

  if (error) {
    const missing = error.code === "42P01" || error.code === "PGRST205" || /chat_tool_access/.test(error.message);
    return NextResponse.json({ error: missing ? NOT_READY : error.message }, { status: missing ? 503 : 500 });
  }
  if (!data) return NextResponse.json({ error: NOT_READY }, { status: 503 });
  return NextResponse.json({ ok: true, open: data.open_to_members, updatedAt: data.updated_at });
}

export const PATCH = authReplies(handlePATCH);
