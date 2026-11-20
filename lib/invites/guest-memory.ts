import { useMemo, useSyncExternalStore } from "react";

// A guest's own phone remembers that they answered, so coming back to the
// page offers their answer (with any private address) instead of a blank
// form. Kept only in that browser; nothing here is sent anywhere. Storage can
// be missing or blocked (private browsing, in-app browsers), so every read
// and write is allowed to fail quietly.

export type RememberedAnswer = { token: string; name: string; at: string };

const ANSWERED_EVENT = "mv-invite-answered";
const key = (slug: string) => `mv-rsvp:${slug.toLowerCase()}`;
const TOKEN_RE = /^[a-f0-9]{32,80}$/;

function raw(slug: string): string | null {
  try {
    return window.localStorage.getItem(key(slug));
  } catch {
    return null;
  }
}

function parse(value: string | null): RememberedAnswer | null {
  try {
    const answer = value ? (JSON.parse(value) as RememberedAnswer) : null;
    return answer && TOKEN_RE.test(answer.token ?? "") ? answer : null;
  } catch {
    return null;
  }
}

const changed = () => window.dispatchEvent(new Event(ANSWERED_EVENT));

export function rememberAnswer(slug: string, value: RememberedAnswer) {
  try {
    window.localStorage.setItem(key(slug), JSON.stringify(value));
  } catch {
    // Nothing to do: the confirmation still offers the personal link.
  }
  changed();
}

export function forgetAnswer(slug: string) {
  try {
    window.localStorage.removeItem(key(slug));
  } catch {
    // Ignore.
  }
  changed();
}

function subscribe(onChange: () => void) {
  window.addEventListener(ANSWERED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(ANSWERED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The answer this browser remembers for the page. Null on the server. */
export function useRememberedAnswer(slug: string): RememberedAnswer | null {
  const value = useSyncExternalStore(
    subscribe,
    () => raw(slug),
    () => null,
  );
  return useMemo(() => parse(value), [value]);
}

const noSubscribe = () => () => {};
function readLinkToken(): string | null {
  const token = new URLSearchParams(window.location.search).get("rsvp");
  return token && TOKEN_RE.test(token) ? token : null;
}

/** The personal link's secret in the address bar, if any. Null on the server. */
export function useLinkToken(): string | null {
  return useSyncExternalStore(noSubscribe, readLinkToken, () => null);
}
