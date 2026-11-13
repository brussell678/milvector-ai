"use client";

import { useSyncExternalStore } from "react";

// Reading localStorage for render without a setState-in-effect round trip.
// Both hooks return `undefined` on the server and during hydration, so markup
// always matches; the stored value (string or null) arrives right after.

const CHANGE_EVENT = "mv-stored-value";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // private mode or blocked storage
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

const noServerValue = () => undefined;

/** Live value: re-renders when `setStoredValue` (or another tab) changes it. */
export function useStoredValue(key: string): string | null | undefined {
  return useSyncExternalStore(subscribe, () => read(key), noServerValue);
}

export function setStoredValue(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable; the in-memory UI state still updates below
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const firstRead = new Map<string, string | null>();
const subscribeNever = () => () => {};

/**
 * The value as it was when this page first read it. Later writes do not change
 * what this returns, which is what "unread since your last visit" needs.
 */
export function useStoredValueAtLoad(key: string): string | null | undefined {
  return useSyncExternalStore(
    subscribeNever,
    () => {
      if (!firstRead.has(key)) firstRead.set(key, read(key));
      return firstRead.get(key) ?? null;
    },
    noServerValue
  );
}
