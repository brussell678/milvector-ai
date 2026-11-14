import { NextResponse } from "next/server";
import { cardBuilderEnabled } from "@/lib/cards/access";
import { summarizeStats, type StatRow } from "@/lib/cards/insights";
import { piiProblem } from "@/lib/cards/opsec";
import { CardDataSchema, readCardData, slugProblem, validPhoto } from "@/lib/cards/schema";
import { supabaseServer } from "@/lib/supabase/server";

type Row = { id: string; slug: string; data: unknown; photo_jpeg: string | null; published: boolean; suspended: boolean; updated_at: string };
type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = "id,slug,data,photo_jpeg,published,suspended,updated_at";

async function signedIn(id: string) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  if (!cardBuilderEnabled(user.email) || !UUID_RE.test(id)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { supabase, user } as const;
}

const present = (row: Row) => ({
  id: row.id,
  slug: row.slug,
  card: readCardData(row.data),
  photo: row.photo_jpeg,
  published: row.published,
  suspended: row.suspended,
  updatedAt: row.updated_at,
});

// Insights and contacts for one card.
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await signedIn(id);
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { data: card } = await supabase.from("business_cards").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const since = new Date(Date.now() - 89 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: stats }, { data: leads }] = await Promise.all([
    supabase.from("business_card_stats").select("day,kind,source,count").eq("card_id", id).gte("day", since),
    supabase
      .from("business_card_leads")
      .select("id,name,email,phone,company,note,source,created_at")
      .eq("card_id", id)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  return NextResponse.json({
    insights: summarizeStats((stats ?? []) as StatRow[], new Date()),
    leads: leads ?? [],
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await signedIn(id);
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = (await req.json().catch(() => null)) as {
    card?: unknown;
    slug?: unknown;
    published?: unknown;
    photo?: { jpeg?: unknown; png?: unknown } | null;
  } | null;
  if (!body) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const update: Record<string, unknown> = {};

  if (body.card !== undefined) {
    const parsed = CardDataSchema.safeParse(body.card);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ error: issue?.message ?? "Check the card details and try again.", field: issue?.path.join(".") }, { status: 400 });
    }
    const pii = piiProblem(parsed.data);
    if (pii) return NextResponse.json({ error: pii }, { status: 400 });
    update.data = parsed.data;
  }

  if (body.slug !== undefined) {
    const slug = String(body.slug).trim().toLowerCase();
    const problem = slugProblem(slug);
    if (problem) return NextResponse.json({ error: problem, field: "slug" }, { status: 400 });
    update.slug = slug;
  }

  if (body.published !== undefined) update.published = body.published === true;

  if (body.photo === null) {
    update.photo_jpeg = null;
    update.photo_png = null;
  } else if (body.photo) {
    const jpeg = String(body.photo.jpeg ?? "");
    const png = String(body.photo.png ?? "");
    if (!validPhoto(jpeg, "jpeg") || !validPhoto(png, "png")) {
      return NextResponse.json({ error: "That photo could not be used. Try a different image." }, { status: 400 });
    }
    update.photo_jpeg = jpeg;
    update.photo_png = png;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const { data, error } = await supabase.from("business_cards").update(update).eq("id", id).eq("user_id", user.id).select(COLUMNS).maybeSingle<Row>();
  if (error?.code === "23505") {
    return NextResponse.json({ error: "That address is already taken. Pick another.", field: "slug" }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ card: present(data) });
}

// Deletes the card, or one contact when ?lead=<id> is given.
export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await signedIn(id);
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const leadId = new URL(req.url).searchParams.get("lead");
  if (leadId) {
    if (!UUID_RE.test(leadId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { error } = await supabase.from("business_card_leads").delete().eq("id", leadId).eq("card_id", id).eq("owner_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("business_cards").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
