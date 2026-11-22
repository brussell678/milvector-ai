import { NextResponse } from "next/server";
import { CONFIRM_WORD, deleteAccount } from "@/lib/account/delete";
import { authReplies, isAdminEmail, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

// DELETE /api/account { confirm: "DELETE" }: the signed-in member deletes
// their own account and everything in it (see lib/account/delete.ts).
async function handleDELETE(req: Request) {
  const { userId, email } = await requireUser();
  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null;
  if (typeof body?.confirm !== "string" || body.confirm.trim() !== CONFIRM_WORD) {
    return NextResponse.json({ error: `Type ${CONFIRM_WORD} to confirm.` }, { status: 400 });
  }
  if (isAdminEmail(email)) {
    return NextResponse.json({ error: "The MilVector admin account can't be deleted from here." }, { status: 403 });
  }

  const admin = supabaseAdmin();
  if (!admin) {
    console.error("[account] delete is not set up: set SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.json({ error: "Account deletion isn't set up yet. Nothing was deleted. Use Support to ask for it." }, { status: 503 });
  }

  const result = await deleteAccount(admin, userId);
  if (!result.ok) {
    console.error(`[account] delete stopped at ${result.stage} for ${userId}: ${result.error}`);
    if (result.stage === "setup") {
      return NextResponse.json({ error: "Account deletion isn't set up yet. Nothing was deleted. Use Support to ask for it." }, { status: 503 });
    }
    const error =
      result.stage === "files"
        ? "We couldn't finish removing your files, so your account is still here. Try again in a minute."
        : "Your files are removed, but your account isn't deleted yet. Try again in a minute; it picks up where it stopped.";
    return NextResponse.json({ error }, { status: 500 });
  }

  // The sign-in record is gone; clear this browser's session too.
  const supabase = await supabaseServer();
  await supabase.auth.signOut().catch(() => undefined);
  return NextResponse.json({ ok: true });
}

export const DELETE = authReplies(handleDELETE);
