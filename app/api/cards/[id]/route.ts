import { NextResponse } from "next/server";
import { cardBuilderEnabled } from "@/lib/cards/access";
import { summarizeStats, type StatRow } from "@/lib/cards/insights";
import { piiProblem } from "@/lib/cards/opsec";
import { isResumeMime, matchesMime, PDF_MIME, RESUME_DOC_TYPES, RESUME_MAX_BYTES, resumeDownloadName } from "@/lib/cards/resume";
import { normalizeBanner } from "@/lib/cards/banner";
import { CardDataSchema, EventModeSchema, readCardData, slugProblem, validBannerUpload, validPhoto } from "@/lib/cards/schema";
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
  const leadsQuery = (columns: string) =>
    supabase.from("business_card_leads").select(columns).eq("card_id", id).order("created_at", { ascending: false }).limit(500);
  const [{ data: stats }, withNotes] = await Promise.all([
    supabase.from("business_card_stats").select("day,kind,source,count").eq("card_id", id).gte("day", since),
    leadsQuery("id,name,email,phone,company,note,source,created_at,event_name,owner_note"),
  ]);
  // Before migration 0041 the event and note columns do not exist yet.
  const leads = withNotes.error ? (await leadsQuery("id,name,email,phone,company,note,source,created_at")).data : withNotes.data;

  return NextResponse.json({
    insights: summarizeStats((stats ?? []) as StatRow[], new Date()),
    leads: leads ?? [],
    notesReady: !withNotes.error,
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
    resume?: { documentId?: unknown } | null;
    banner?: { jpeg?: unknown; linkedinId?: unknown } | null;
    event?: { name?: unknown; hours?: unknown } | null;
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

  // Attach a resume: copy one of the member's own files onto the card.
  let resume: { name: string; isPdf: boolean; updatedAt: string } | null | undefined;
  if (body.resume === null) {
    Object.assign(update, { resume_data: null, resume_name: null, resume_mime: null, resume_updated_at: null });
    resume = null;
  } else if (body.resume) {
    const documentId = String(body.resume.documentId ?? "");
    if (!UUID_RE.test(documentId)) return NextResponse.json({ error: "Pick a resume from the list." }, { status: 400 });
    const { data: doc } = await supabase
      .from("documents")
      .select("id,doc_type,mime_type,storage_path,size_bytes")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; doc_type: string; mime_type: string; storage_path: string; size_bytes: number }>();
    if (!doc || !(RESUME_DOC_TYPES as readonly string[]).includes(doc.doc_type)) {
      return NextResponse.json({ error: "That file was not found in My Files. Refresh the page and pick again." }, { status: 404 });
    }
    if (!isResumeMime(doc.mime_type)) {
      return NextResponse.json({ error: "Only PDF and Word resumes can go on a card. Upload a PDF version to My Files." }, { status: 400 });
    }
    if (doc.size_bytes > RESUME_MAX_BYTES) {
      return NextResponse.json({ error: "That file is larger than 3 MB. Upload a smaller PDF to My Files." }, { status: 400 });
    }
    const { data: file, error: downloadError } = await supabase.storage.from("documents").download(doc.storage_path);
    if (downloadError || !file) return NextResponse.json({ error: "That file could not be read. Try again in a moment." }, { status: 500 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > RESUME_MAX_BYTES || !matchesMime(bytes, doc.mime_type)) {
      return NextResponse.json({ error: "That file does not look like a valid PDF or Word document. Upload it again to My Files." }, { status: 400 });
    }
    const { data: current } = await supabase.from("business_cards").select("data").eq("id", id).eq("user_id", user.id).maybeSingle<{ data: unknown }>();
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const cardName = update.data ? (update.data as { name: string }).name : readCardData(current.data).name;
    const updatedAt = new Date().toISOString();
    const name = resumeDownloadName(cardName, doc.mime_type);
    Object.assign(update, { resume_data: Buffer.from(bytes).toString("base64"), resume_name: name, resume_mime: doc.mime_type, resume_updated_at: updatedAt });
    resume = { name, isPdf: doc.mime_type === PDF_MIME, updatedAt };
  }

  // Banner: an upload, one of the member's LinkedIn Builder banners, or removal.
  // Either source is re-encoded to 1584 x 396 on the server.
  let bannerVersion: string | null | undefined;
  if (body.banner === null) {
    Object.assign(update, { banner_jpeg: null, banner_updated_at: null });
    bannerVersion = null;
  } else if (body.banner) {
    let source: Uint8Array | null = null;
    if (body.banner.linkedinId !== undefined) {
      const linkedinId = String(body.banner.linkedinId ?? "");
      if (!UUID_RE.test(linkedinId)) return NextResponse.json({ error: "Pick a banner from the list." }, { status: 400 });
      const { data: profile } = await supabase
        .from("linkedin_profiles")
        .select("banner_image_path")
        .eq("id", linkedinId)
        .eq("user_id", user.id)
        .maybeSingle<{ banner_image_path: string | null }>();
      if (!profile?.banner_image_path) {
        return NextResponse.json({ error: "That banner was not found. Refresh the page and pick again." }, { status: 404 });
      }
      const { data: file } = await supabase.storage.from("linkedin-banners").download(profile.banner_image_path);
      if (!file) return NextResponse.json({ error: "That banner could not be read. Try again in a moment." }, { status: 500 });
      source = new Uint8Array(await file.arrayBuffer());
    } else {
      const jpeg = String(body.banner.jpeg ?? "");
      if (!validBannerUpload(jpeg)) return NextResponse.json({ error: "That image could not be used. Try a different JPEG or PNG." }, { status: 400 });
      source = Buffer.from(jpeg, "base64");
    }
    const normalized = await normalizeBanner(source);
    if (!normalized) return NextResponse.json({ error: "That image could not be used. Try a different one." }, { status: 400 });
    bannerVersion = new Date().toISOString();
    Object.assign(update, { banner_jpeg: normalized, banner_updated_at: bannerVersion });
  }

  // Event mode: contacts that arrive while it is on are tagged with the event.
  let event: { name: string; until: string } | null | undefined;
  if (body.event === null) {
    Object.assign(update, { event_name: null, event_until: null });
    event = null;
  } else if (body.event) {
    const parsed = EventModeSchema.safeParse(body.event);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the event details.", field: "event" }, { status: 400 });
    const until = new Date(Date.now() + parsed.data.hours * 3_600_000).toISOString();
    Object.assign(update, { event_name: parsed.data.name, event_until: until });
    event = { name: parsed.data.name, until };
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const { data, error } = await supabase.from("business_cards").update(update).eq("id", id).eq("user_id", user.id).select(COLUMNS).maybeSingle<Row>();
  if (error && (bannerVersion !== undefined || event !== undefined) && /banner_|event_/.test(error.message)) {
    return NextResponse.json(
      { error: "Banners and event mode are not set up yet. Run migration 0041_business_card_upgrades.sql in the Supabase SQL editor." },
      { status: 503 },
    );
  }
  if (error?.code === "23505") {
    return NextResponse.json({ error: "That address is already taken. Pick another.", field: "slug" }, { status: 409 });
  }
  if (error && resume !== undefined && /resume_/.test(error.message)) {
    return NextResponse.json({ error: "Resume attachments are not set up yet. Run migration 0030_business_card_resume.sql in the Supabase SQL editor." }, { status: 503 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // `resume`, `bannerVersion`, and `event` are included only when this request changed them.
  return NextResponse.json({
    card: present(data),
    ...(resume !== undefined ? { resume } : {}),
    ...(bannerVersion !== undefined ? { bannerVersion } : {}),
    ...(event !== undefined ? { event } : {}),
  });
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
