import { NextResponse } from "next/server";
import { z } from "zod";
import { authReplies, requireUser } from "@/lib/auth";
import { ACK_TOOLS, DECISION_NOTICE_VERSION } from "@/lib/legal/decision-notice";
import { supabaseServer } from "@/lib/supabase/server";

// Records that the member confirmed the Decide notice for the VA or SBP tool
// (migration 0045). The version and time come from the server, never the page.
// 503 until 0045 runs: the page then opens the tool without a record.
const AckSchema = z.object({ tool: z.enum(ACK_TOOLS as unknown as [string, ...string[]]) });

async function handlePOST(req: Request) {
  const { userId } = await requireUser();
  const parsed = AckSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That is not a tool that asks for this." }, { status: 400 });

  const supabase = await supabaseServer();
  const { error } = await supabase.from("tool_acknowledgments").insert({ user_id: userId, tool: parsed.data.tool, notice_version: DECISION_NOTICE_VERSION });
  // 23505: already confirmed this version, which is fine.
  if (error && error.code !== "23505") {
    const missing = error.code === "42P01" || error.code === "PGRST205" || /tool_acknowledgments.*(does not exist|schema cache)|does not exist.*tool_acknowledgments/i.test(error.message);
    if (missing) return NextResponse.json({ error: "Confirmations are not being recorded yet." }, { status: 503 });
    console.error("[acknowledgments] insert failed:", error.message);
    return NextResponse.json({ error: "That did not save. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, version: DECISION_NOTICE_VERSION });
}

export const POST = authReplies(handlePOST);
