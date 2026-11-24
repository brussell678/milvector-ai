import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth";
import { cardBuilderEnabled } from "@/lib/cards/access";
import { appleConfig, appleSetupProblems } from "@/lib/cards/apple-pass";
import { googleConfig, googleSetupProblems } from "@/lib/cards/google-pass";
import { piiProblem } from "@/lib/cards/opsec";
import { PDF_MIME, RESUME_DOC_TYPES, RESUME_MIMES, resumeOptions } from "@/lib/cards/resume";
import { lockedTargetedDocs } from "@/lib/resume/review-lock";
import { activeEvent, CardDataSchema, MAX_CARDS_PER_USER, readCardData, slugFromName } from "@/lib/cards/schema";
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

  // Resume attachments arrive with migration 0030. Until it is run this query
  // fails and the editor shows the feature as not ready, without breaking.
  const { data: attached, error: attachedError } = await supabase
    .from("business_cards")
    .select("id,resume_name,resume_mime,resume_updated_at")
    .eq("user_id", user.id);
  const attachedById = new Map(
    ((attached ?? []) as { id: string; resume_name: string | null; resume_mime: string | null; resume_updated_at: string | null }[]).map((row) => [row.id, row]),
  );
  // Banners and event mode arrive with migration 0041; until then this query
  // fails and the editor shows both as not set up yet.
  const { data: extras, error: extrasError } = await supabase
    .from("business_cards")
    .select("id,banner_updated_at,event_name,event_until")
    .eq("user_id", user.id);
  const extrasById = new Map(
    ((extras ?? []) as { id: string; banner_updated_at: string | null; event_name: string | null; event_until: string | null }[]).map((row) => [row.id, row]),
  );

  // Banners the member made in the LinkedIn Builder, newest first, to reuse on a card.
  const { data: linkedinRows } = await supabase
    .from("linkedin_profiles")
    .select("id,version_label,banner_image_path,created_at")
    .eq("user_id", user.id)
    .not("banner_image_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(6);
  const linkedinBanners = (
    await Promise.all(
      ((linkedinRows ?? []) as { id: string; version_label: string | null; banner_image_path: string; created_at: string }[]).map(async (row) => {
        const { data: signed } = await supabase.storage.from("linkedin-banners").createSignedUrl(row.banner_image_path, 60 * 60);
        return signed?.signedUrl ? { id: row.id, label: row.version_label || "LinkedIn banner", createdAt: row.created_at, url: signed.signedUrl } : null;
      }),
    )
  ).filter(Boolean);

  const { data: docs } = await supabase
    .from("documents")
    .select("id,filename,doc_type,mime_type,size_bytes,created_at")
    .eq("user_id", user.id)
    .in("doc_type", [...RESUME_DOC_TYPES])
    .in("mime_type", [...RESUME_MIMES])
    .order("created_at", { ascending: false })
    .limit(100);
  // A targeted resume waiting on its line review is not offered (D15).
  const lockedDocs = await lockedTargetedDocs(
    supabase,
    user.id,
    (docs ?? []).filter((doc) => doc.doc_type === "TARGETED_RESUME").map((doc) => doc.id),
  );

  return NextResponse.json({
    cards: ((data ?? []) as Row[]).map((row) => ({
      id: row.id,
      slug: row.slug,
      card: readCardData(row.data),
      photo: row.photo_jpeg,
      published: row.published,
      suspended: row.suspended,
      updatedAt: row.updated_at,
      resume: attachedById.get(row.id)?.resume_name
        ? {
            name: attachedById.get(row.id)!.resume_name!,
            isPdf: attachedById.get(row.id)!.resume_mime === PDF_MIME,
            updatedAt: attachedById.get(row.id)!.resume_updated_at,
          }
        : null,
      bannerVersion: extrasById.get(row.id)?.banner_updated_at ?? null,
      event: activeEvent(extrasById.get(row.id)?.event_name, extrasById.get(row.id)?.event_until),
    })),
    resumeReady: !attachedError,
    upgradesReady: !extrasError,
    linkedinBanners,
    resumeOptions: resumeOptions((docs ?? []).filter((doc) => !lockedDocs.has(doc.id))),
    maxCards: MAX_CARDS_PER_USER,
    wallet: { apple: !!appleConfig(), google: !!googleConfig() },
    // The admin only: which wallet settings are missing or will not work (names, never values).
    ...(isAdminEmail(user.email) ? { walletSetup: { apple: appleSetupProblems(), google: googleSetupProblems() } } : {}),
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
        card: {
          id: data.id,
          slug: data.slug,
          card: readCardData(data.data),
          photo: null,
          published: false,
          suspended: false,
          updatedAt: data.updated_at,
          resume: null,
          bannerVersion: null,
          event: null,
        },
      });
    }
    if (error?.code !== "23505") return NextResponse.json({ error: error?.message ?? "The card could not be created." }, { status: 500 });
  }
  return NextResponse.json({ error: "The card could not be created. Try again." }, { status: 500 });
}
