import { NextResponse } from "next/server";
import { isMissingSchema } from "@/lib/cards/store";
import { MessageSubmitSchema } from "@/lib/invites/rsvp";
import { supabaseServer } from "@/lib/supabase/server";

const REASONS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: "This page is not taking messages right now." },
  closed: { status: 409, error: "Messages are closed on this page." },
  busy: { status: 429, error: "A lot of messages came in today. Please try again tomorrow." },
  invalid: { status: 400, error: "Add your name and a message, then try again." },
};

// A guest leaves a message on the day or after. No account needed.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Please fill in the form and try again." }, { status: 400 });
  // Honeypot: answer as if it worked so a bot learns nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") return NextResponse.json({ ok: true });

  const parsed = MessageSubmitSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form and try again." }, { status: 400 });

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("submit_invite_message", { p_slug: slug, p_name: parsed.data.name, p_message: parsed.data.message });
  if (error) {
    return NextResponse.json(
      { error: isMissingSchema(error) ? "Messages are not set up on this site yet." : "That did not go through. Please try again in a moment." },
      { status: isMissingSchema(error) ? 503 : 500 },
    );
  }
  const result = (data ?? {}) as { ok?: boolean; reason?: string };
  if (!result.ok) {
    const reason = REASONS[result.reason ?? ""] ?? REASONS.invalid;
    return NextResponse.json({ error: reason.error }, { status: reason.status });
  }
  return NextResponse.json({ ok: true });
}
