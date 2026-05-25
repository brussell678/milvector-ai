import type { SupabaseClient, User } from "@supabase/supabase-js";

type ProfileSyncFields = {
  branch?: string | null;
  eas_date?: string | null;
  rank?: string | null;
  mos?: string | null;
  terminal_leave_start?: string | null;
  ptad_start?: string | null;
  retirement_ceremony_date?: string | null;
};

function pickMetadataString(user: User, key: string) {
  const value = user.user_metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function syncAuthenticatedProfile(
  supabase: SupabaseClient,
  user: User,
  fields: ProfileSyncFields = {}
) {
  const { data: existing } = await supabase
    .from("profiles")
    .select("branch,rank,mos,eas_date,terminal_leave_start,ptad_start,retirement_ceremony_date")
    .eq("id", user.id)
    .maybeSingle();

  const branch = fields.branch?.trim() || pickMetadataString(user, "branch") || existing?.branch || "USMC";
  const easDate = fields.eas_date || pickMetadataString(user, "eas_date") || existing?.eas_date || null;

  return supabase.from("profiles").upsert({
    id: user.id,
    email: user.email ?? null,
    branch,
    rank: fields.rank ?? pickMetadataString(user, "rank") ?? existing?.rank ?? null,
    mos: fields.mos ?? pickMetadataString(user, "mos") ?? existing?.mos ?? null,
    eas_date: easDate,
    separation_date: easDate,
    terminal_leave_start:
      fields.terminal_leave_start ?? pickMetadataString(user, "terminal_leave_start") ?? existing?.terminal_leave_start ?? null,
    ptad_start: fields.ptad_start ?? pickMetadataString(user, "ptad_start") ?? existing?.ptad_start ?? null,
    retirement_ceremony_date:
      fields.retirement_ceremony_date ??
      pickMetadataString(user, "retirement_ceremony_date") ??
      existing?.retirement_ceremony_date ??
      null,
  }, {
    onConflict: "id",
  });
}
