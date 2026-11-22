import { NextResponse } from "next/server";
import { syncAuthenticatedProfile } from "@/lib/auth-profile";
import { safeNext } from "@/lib/safe-next";
import { supabaseServer } from "@/lib/supabase/server";

function formatAuthErrorMessage(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("pkce code verifier not found")) {
    return "That sign-in link was opened in a different browser or device than the one that requested it. Request a fresh link and open it on the same device, or switch the Supabase email template to the token-hash confirm flow for cross-device sign-in.";
  }

  return message;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  // A path on this site only: the link is emailed, so its query can be crafted.
  const next = safeNext(url.searchParams.get("next"));
  const origin = url.origin;

  const supabase = await supabaseServer();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/auth?error=${encodeURIComponent(formatAuthErrorMessage(error.message))}`, origin));
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await syncAuthenticatedProfile(supabase, user);
    return NextResponse.redirect(new URL(next, origin));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "email" | "recovery" | "invite" | "email_change",
    });

    if (error) {
      return NextResponse.redirect(new URL(`/auth?error=${encodeURIComponent(formatAuthErrorMessage(error.message))}`, origin));
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await syncAuthenticatedProfile(supabase, user);
    return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/auth", origin));
}
