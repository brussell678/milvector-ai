import { createClient } from "@supabase/supabase-js";

// Service-role client for privileged server-side storage/DB access that must
// bypass RLS (e.g. reading a private feedback attachment to embed in an email).
// Returns null when SUPABASE_SERVICE_ROLE_KEY is not configured, so callers can
// degrade gracefully instead of throwing.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
