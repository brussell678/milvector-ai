import { supabaseServer } from "@/lib/supabase/server";

export const ADMIN_EMAIL = "russell.innovation.group@gmail.com";

export function isAdminEmail(email?: string | null) {
  return (email ?? "").trim().toLowerCase() === ADMIN_EMAIL;
}

export async function requireUser() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return { userId: data.user.id };
}

export async function requireAdmin() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || !isAdminEmail(data.user.email)) {
    throw new Response("Forbidden", { status: 403 });
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
  };
}
