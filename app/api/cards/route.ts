import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cardBuilderEnabled } from "@/lib/cards/access";
import { appleConfig } from "@/lib/cards/apple-pass";
import { googleConfig } from "@/lib/cards/google-pass";
import { piiProblem } from "@/lib/cards/opsec";
import { CardDataSchema, MAX_CARDS_PER_USER, readCardData, slugFromName } from "@/lib/cards/schema";
import { isMissingSchema, MIGRATION_MESSAGE } from "@/lib/cards/store";
import { supabaseServer } from "@/lib/supabase/server";

type Row = { id: string; slug: string; data: unknown; photo_jpeg: string | null; published: boolean; suspended: boolean; updated_at: string };

async function signedIn() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  if (!cardBuilderEnabled(user.email)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { supabase, user } as const;
}

export async function GET() {
  const auth = await signedIn();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from("business_cards")
    .select("id,slug,data,photo_jpeg,published,suspended,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: isMissingSchema(error) ? MIGRATION_MESSAGE : error.message }, { status: isMissingSchema(error) ? 503 : 500 });
  }

  // Starting values for a first card, taken from the member's profile.
  const { data: profile } = await supabase
    .from("profiles")
    .select("branch,professional_email,phone_number,linkedin_url,location")
    .eq("id", user.id)
    .maybeSingle();
  const fullName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").trim();

  return NextResponse.json({
    cards: ((data ?? []) as Row[]).map((row) => ({
      id: row.id,
      slug: row.slug,
      card: readCardData(row.data),
      photo: row.photo_jpeg,
      published: row.published,
      suspended: row.suspended,
      updatedAt: row.updated_at,
    })),
    maxCards: MAX_CARDS_PER_USER,
    wallet: { apple: !!appleConfig(), google: !!googleConfig() },
    defaults: {
      name: fullName,
      email: profile?.professional_email ?? "",
      phone: profile?.phone_number ?? "",
      location: profile?.location ?? "",
      linkedin: profile?.linkedin_url ?? "",
    },
  });
}

export async function POST(req: Request) {
  const auth = await signedIn();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = (await req.json().catch(() => null)) as { card?: unknown } | null;
  const parsed = CardDataSchema.safeParse(body?.card);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the card details and try again." }, { status: 400 });
  }

  const pii = piiProblem(parsed.data);
  if (pii) return NextResponse.json({ error: pii }, { status: 400 });

  const { count, error: countError } = await supabase.from("business_cards").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (countError) {
    return NextResponse.json(
      { error: isMissingSchema(countError) ? MIGRATION_MESSAGE : countError.message },
      { status: isMissingSchema(countError) ? 503 : 500 },
    );
  }
  if ((count ?? 0) >= MAX_CARDS_PER_USER) {
    return NextResponse.json({ error: `You can have up to ${MAX_CARDS_PER_USER} cards. Delete one to make another.` }, { status: 409 });
  }

  // The address gets a random tail so two people with one name never collide
  // and a card cannot be found by guessing a name. The owner can change it.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slug = slugFromName(parsed.data.name, randomBytes(3).toString("hex").slice(0, 5));
    const { data, error } = await supabase
      .from("business_cards")
      .insert({ user_id: user.id, slug, data: parsed.data, published: false })
      .select("id,slug,data,photo_jpeg,published,suspended,updated_at")
      .single<Row>();
    if (!error && data) {
      return NextResponse.json({
        card: { id: data.id, slug: data.slug, card: readCardData(data.data), photo: null, published: false, suspended: false, updatedAt: data.updated_at },
      });
    }
    if (error?.code !== "23505") return NextResponse.json({ error: error?.message ?? "The card could not be created." }, { status: 500 });
  }
  return NextResponse.json({ error: "The card could not be created. Try again." }, { status: 500 });
}
