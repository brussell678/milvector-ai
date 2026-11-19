import { NextResponse } from "next/server";
import { isMissingSchema } from "@/lib/cards/store";
import { RsvpSubmitSchema } from "@/lib/invites/rsvp";
import { supabaseServer } from "@/lib/supabase/server";

type Params = { params: Promise<{ slug: string }> };

const REASONS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: "This invitation is not taking answers right now." },
  closed: { status: 409, error: "RSVPs are closed for this invitation. Contact the host with any questions." },
  busy: { status: 429, error: "This invitation has had a lot of answers today. Please try again tomorrow, or contact the host." },
  full: { status: 409, error: "This invitation has reached its guest limit. Contact the host." },
  invalid: { status: 400, error: "Check your name, email, and answers, then try again." },
};

// A guest answers. No account: the database function checks the page is
// live, cleans the answer, and returns the private addresses it releases.
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Please fill in the form and try again." }, { status: 400 });

  // Honeypot: a real guest never sees or fills this field. Answer as if it
  // worked so a bot learns nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") return NextResponse.json({ ok: true, token: null, addresses: {}, late: false });

  const parsed = RsvpSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form and try again." }, { status: 400 });
  }
  const rsvp = parsed.data;

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("submit_invite_rsvp", {
    p_slug: slug,
    p_token: rsvp.token ?? null,
    p_name: rsvp.name,
    p_email: rsvp.email,
    p_phone: rsvp.phone,
    p_answers: rsvp.answers,
    p_meals: rsvp.meals,
    p_dietary: rsvp.dietary,
    p_dod_id: rsvp.dodId,
    p_pass_names: rsvp.passNames,
    p_message: rsvp.message,
  });
  if (error) {
    return NextResponse.json(
      { error: isMissingSchema(error) ? "RSVPs are not set up on this site yet." : "That did not go through. Please try again in a moment." },
      { status: isMissingSchema(error) ? 503 : 500 },
    );
  }
  const result = (data ?? {}) as { ok?: boolean; reason?: string; token?: string; addresses?: Record<string, string>; late?: boolean };
  if (!result.ok) {
    const reason = REASONS[result.reason ?? ""] ?? REASONS.invalid;
    return NextResponse.json({ error: reason.error }, { status: reason.status });
  }
  return NextResponse.json({ ok: true, token: result.token ?? null, addresses: result.addresses ?? {}, late: !!result.late });
}

// A guest reopens their own answer from their personal link.
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{32,80}$/.test(token)) return NextResponse.json({ error: "That link does not work." }, { status: 404 });
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("get_invite_rsvp", { p_slug: slug, p_token: token });
  if (error || !data) return NextResponse.json({ error: "That link no longer works. Answer again with the same email to update your RSVP." }, { status: 404 });
  return NextResponse.json({ rsvp: data }, { headers: { "Cache-Control": "no-store" } });
}
