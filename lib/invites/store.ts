import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth";
import { mergePrivate, readInviteData, type InviteData } from "@/lib/invites/schema";

// ─── The owner's editor ───────────────────────────────────────────────

export type OwnerRow = {
  id: string;
  slug: string;
  data: unknown;
  private_data: unknown;
  cover_jpeg: string | null;
  published: boolean;
  suspended: boolean;
  updated_at: string;
};

export const OWNER_COLUMNS = "id,slug,data,private_data,cover_jpeg,published,suspended,updated_at";

// What the builder receives: the full invitation, private addresses included.
export function presentInvite(row: OwnerRow) {
  return {
    id: row.id,
    slug: row.slug,
    invite: mergePrivate(readInviteData(row.data), row.private_data),
    cover: row.cover_jpeg,
    published: row.published,
    suspended: row.suspended,
    updatedAt: row.updated_at,
  };
}

// ─── The guest page ───────────────────────────────────────────────────

export type LoadedInvite = {
  id: string;
  slug: string;
  data: InviteData;
  hasCover: boolean;
  updatedAt: string;
  // "live" is what any guest sees. The other states are only ever returned to
  // the owner or the admin.
  state: "live" | "draft" | "suspended";
  viewer: "public" | "owner" | "admin";
};

type PublicRow = { id: string; slug: string; data: unknown; has_cover: boolean; updated_at: string };
type OwnRow = { id: string; slug: string; data: unknown; cover_jpeg: string | null; published: boolean; suspended: boolean; user_id: string; updated_at: string };

// The page as a guest sees it. Private addresses are never loaded here, even
// for the owner, so the owner's preview shows exactly what a guest gets.
export async function loadInviteForViewer(supabase: SupabaseClient, slug: string): Promise<LoadedInvite | null> {
  const clean = slug.toLowerCase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A signed-in owner or the admin reads the row itself, so a draft or a
  // suspended page can still be previewed by the people allowed to see it.
  if (user) {
    const { data } = await supabase
      .from("retirement_invites")
      .select("id,slug,data,cover_jpeg,published,suspended,user_id,updated_at")
      .eq("slug", clean)
      .maybeSingle<OwnRow>();
    if (data) {
      const owner = data.user_id === user.id;
      if (owner || isAdminEmail(user.email)) {
        return {
          id: data.id,
          slug: data.slug,
          data: readInviteData(data.data),
          hasCover: !!data.cover_jpeg,
          updatedAt: data.updated_at,
          state: data.suspended ? "suspended" : data.published ? "live" : "draft",
          viewer: owner ? "owner" : "admin",
        };
      }
    }
  }

  const { data, error } = await supabase.rpc("get_public_invite", { p_slug: clean });
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as PublicRow;
  return { id: row.id, slug: row.slug, data: readInviteData(row.data), hasCover: row.has_cover, updatedAt: row.updated_at, state: "live", viewer: "public" };
}

// ─── Career photos ────────────────────────────────────────────────────

export type InvitePhoto = { id: string; position: number; caption: string; updatedAt: string };

// The photo list (no image data) for a page the viewer is allowed to see.
// Guests get it through the public function; the owner previewing a draft
// reads their own rows. Empty when migration 0034 has not been run.
export async function loadInvitePhotos(supabase: SupabaseClient, slug: string, viewer: LoadedInvite["viewer"], inviteId: string): Promise<InvitePhoto[]> {
  type Row = { id: string; position: number; caption: string; updated_at: string };
  const map = (rows: Row[]) => rows.map((row) => ({ id: row.id, position: row.position, caption: row.caption, updatedAt: row.updated_at }));
  if (viewer !== "public") {
    const { data } = await supabase.from("retirement_invite_photos").select("id,position,caption,updated_at").eq("invite_id", inviteId).order("position");
    if (Array.isArray(data)) return map(data as Row[]);
  }
  const { data } = await supabase.rpc("get_public_invite_photos", { p_slug: slug.toLowerCase() });
  return Array.isArray(data) ? map(data as Row[]) : [];
}

// One photo's image (base64 JPEG) for a page the viewer is allowed to see.
export async function loadInvitePhoto(supabase: SupabaseClient, slug: string, photoId: string): Promise<string | null> {
  const { data } = await supabase.rpc("get_public_invite_photo", { p_slug: slug.toLowerCase(), p_id: photoId });
  if (typeof data === "string" && data) return data;
  // Draft preview for the owner; row policies decide who gets a row back.
  const { data: own } = await supabase.from("retirement_invite_photos").select("jpeg").eq("id", photoId).maybeSingle<{ jpeg: string }>();
  return own?.jpeg ?? null;
}

// Cover photo bytes (base64 JPEG) for a page the viewer is allowed to see.
export async function loadInviteCover(supabase: SupabaseClient, slug: string): Promise<string | null> {
  const clean = slug.toLowerCase();
  const { data } = await supabase.rpc("get_public_invite_cover", { p_slug: clean });
  if (typeof data === "string" && data) return data;
  // Draft preview for the owner; row policies decide who gets a row back.
  const { data: own } = await supabase.from("retirement_invites").select("cover_jpeg").eq("slug", clean).maybeSingle<{ cover_jpeg: string | null }>();
  return own?.cover_jpeg ?? null;
}
