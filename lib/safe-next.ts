// Where to send someone after they sign in. Only a path on this site is
// allowed, so a crafted link cannot send a member to another site straight
// after sign-in (an open redirect). Anything else falls back.

const MAX_LENGTH = 512;

export function safeNext(value: string | null | undefined, fallback = "/app"): string {
  if (typeof value !== "string") return fallback;
  const next = value.trim();
  if (!next || next.length > MAX_LENGTH) return fallback;
  // One leading slash, then not a second slash or backslash (//evil.com and
  // /\evil.com are other sites to a browser), and no control characters.
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  // Resolve against a placeholder origin: if it lands anywhere else, refuse.
  try {
    const url = new URL(next, "https://placeholder.invalid");
    if (url.origin !== "https://placeholder.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** The address to land on once signed in; never the sign-in page itself, which would loop. */
export function afterSignIn(value: string | null | undefined): string {
  const next = safeNext(value);
  return next === "/auth" || next.startsWith("/auth?") || next.startsWith("/auth/") ? "/app" : next;
}
