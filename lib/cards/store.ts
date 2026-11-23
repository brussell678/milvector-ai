import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth";
import { readCardData, type CardData } from "@/lib/cards/schema";

export type LoadedCard = {
  id: string;
  slug: string;
  card: CardData;
  hasPhoto: boolean;
  // "live" is what any visitor sees. The other states are only ever returned
  // to the card's owner or the admin.
  state: "live" | "draft" | "suspended";
  viewer: "public" | "owner" | "admin";
};

type PublicRow = { id: string; slug: string; data: unknown; has_photo: boolean };
type OwnRow = { id: string; slug: string; data: unknown; photo_jpeg: string | null; published: boolean; suspended: boolean; user_id: string };

// Postgres reports a missing table or function with these codes. Used to tell
// "migration 0029 has not been run" apart from a real failure.
export function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code ?? "") || /does not exist|schema cache/i.test(error.message ?? "");
}

export const MIGRATION_MESSAGE = "Card storage is not set up yet. Run migration 0029_business_cards.sql in the Supabase SQL editor.";

export async function loadCardForViewer(supabase: SupabaseClient, slug: string): Promise<LoadedCard | null> {
  const clean = slug.toLowerCase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A signed-in owner or the admin reads the row itself, so a draft or a
  // suspended card can still be previewed by the people allowed to see it.
  if (user) {
    const { data } = await supabase
      .from("business_cards")
      .select("id,slug,data,photo_jpeg,published,suspended,user_id")
      .eq("slug", clean)
      .maybeSingle<OwnRow>();
    if (data) {
      const owner = data.user_id === user.id;
      if (owner || isAdminEmail(user.email)) {
        return {
          id: data.id,
          slug: data.slug,
          card: readCardData(data.data),
          hasPhoto: !!data.photo_jpeg,
          state: data.suspended ? "suspended" : data.published ? "live" : "draft",
          viewer: owner ? "owner" : "admin",
        };
      }
    }
  }

  const { data, error } = await supabase.rpc("get_public_card", { p_slug: clean });
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as PublicRow;
  return { id: row.id, slug: row.slug, card: readCardData(row.data), hasPhoto: row.has_photo, state: "live", viewer: "public" };
}

// The attached resume's file name, or null when there is none. Also null
// when migration 0030 has not been run, so the card simply shows no button.
export async function loadCardResumeName(supabase: SupabaseClient, slug: string): Promise<string | null> {
  const clean = slug.toLowerCase();
  const { data } = await supabase.rpc("get_public_card_resume_name", { p_slug: clean });
  if (typeof data === "string" && data) return data;
  // Draft preview for the owner.
  const { data: own } = await supabase.from("business_cards").select("resume_name").eq("slug", clean).maybeSingle<{ resume_name: string | null }>();
  return own?.resume_name ?? null;
}

export async function loadCardResume(supabase: SupabaseClient, slug: string): Promise<{ name: string; mime: string; data: string } | null> {
  const clean = slug.toLowerCase();
  const { data } = await supabase.rpc("get_public_card_resume", { p_slug: clean });
  const row = Array.isArray(data) ? (data[0] as { name: string; mime: string; data: string } | undefined) : undefined;
  if (row?.data) return row;
  const { data: own } = await supabase
    .from("business_cards")
    .select("resume_name,resume_mime,resume_data")
    .eq("slug", clean)
    .maybeSingle<{ resume_name: string | null; resume_mime: string | null; resume_data: string | null }>();
  if (!own?.resume_data || !own.resume_name || !own.resume_mime) return null;
  return { name: own.resume_name, mime: own.resume_mime, data: own.resume_data };
}

// The banner's version (its last change) for a card the viewer may see, or
// null when it has none. Lets the page show a banner without loading it.
// Also null before migration 0041, so the card keeps its color band.
export async function loadCardBannerVersion(supabase: SupabaseClient, slug: string): Promise<string | null> {
  const clean = slug.toLowerCase();
  const { data } = await supabase.rpc("get_public_card_banner_version", { p_slug: clean });
  if (typeof data === "string" && data) return data;
  // Draft preview for the owner.
  const { data: own } = await supabase
    .from("business_cards")
    .select("banner_updated_at")
    .eq("slug", clean)
    .not("banner_jpeg", "is", null)
    .maybeSingle<{ banner_updated_at: string | null }>();
  return own?.banner_updated_at ?? null;
}

export async function loadCardBanner(supabase: SupabaseClient, slug: string): Promise<string | null> {
  const clean = slug.toLowerCase();
  const { data } = await supabase.rpc("get_public_card_banner", { p_slug: clean });
  if (typeof data === "string" && data) return data;
  // Draft preview for the owner.
  const { data: own } = await supabase.from("business_cards").select("banner_jpeg").eq("slug", clean).maybeSingle<{ banner_jpeg: string | null }>();
  return own?.banner_jpeg ?? null;
}

// Photo bytes for a card the viewer is allowed to see.
export async function loadCardPhoto(supabase: SupabaseClient, slug: string, format: "jpeg" | "png"): Promise<string | null> {
  const clean = slug.toLowerCase();
  const { data } = await supabase.rpc("get_public_card_photo", { p_slug: clean, p_format: format });
  if (typeof data === "string" && data) return data;
  // Draft preview for the owner.
  const column = format === "png" ? "photo_png" : "photo_jpeg";
  const { data: own } = await supabase.from("business_cards").select(column).eq("slug", clean).maybeSingle<Record<string, string | null>>();
  return own?.[column] ?? null;
}
