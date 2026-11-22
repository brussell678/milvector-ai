import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const ADMIN_EMAIL = "russell.innovation.group@gmail.com";

export function isAdminEmail(email?: string | null) {
  return (email ?? "").trim().toLowerCase() === ADMIN_EMAIL;
}

// requireUser and requireAdmin stop a request by throwing a ready JSON reply.
// A route handler that throws turns into an empty 500, so every API route
// that uses them is wrapped in authReplies, which sends that reply instead.
export const SESSION_ENDED = "Your session ended. Sign in again, then try once more.";
export const ADMIN_ONLY = "Only the MilVector admin can do that.";

/** Wraps a route handler so a reply thrown by requireUser or requireAdmin is sent as is. */
export function authReplies<A extends unknown[], R extends Response>(handler: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R | Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof Response) return error;
      throw error;
    }
  };
}

export async function requireUser() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw NextResponse.json({ error: SESSION_ENDED }, { status: 401 });
  }

  return { userId: data.user.id, email: data.user.email ?? null };
}

export async function requireAdmin() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || !isAdminEmail(data.user.email)) {
    throw NextResponse.json({ error: ADMIN_ONLY }, { status: 403 });
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
  };
}
