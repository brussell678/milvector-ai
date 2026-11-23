"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readEvents, type ChatEvent } from "@/lib/chat/stream";
import { CHAT_TURN_CHARS, CHAT_TURNS_SENT, type ChatToolId } from "@/lib/chat/tools";
import type { Transcript } from "@/lib/chat/transcript";

// One chat's state, shared by every chat tool: the messages, what is working
// right now, the follow-up stream, and the copy kept in the member's browser
// (D3a: a refresh or a locked phone does not lose the chat; New chat clears
// it; nothing new is kept on our side).

export type ChatMessage<Result, Run> =
  // action: a run the member started ("Translate: 0311"). paste: text never
  // sent to the model as a turn (a whole posting pasted into the reply box,
  // or a VA condition's description, which goes only to its analysis).
  | { id: string; role: "user"; text: string; action?: boolean; paste?: boolean }
  // local: written by the page, not the model (an offer to run the tool), so
  // it is not sent to the model or written into the transcript.
  | { id: string; role: "assistant"; kind: "text"; text: string; streaming?: boolean; stopped?: boolean; error?: string; question?: string; suggestions?: string[]; run?: Run | null; local?: boolean }
  | { id: string; role: "assistant"; kind: "result"; result: Result; inputs: Run }
  // crisis: the Veterans Crisis Line card (the VA chat, docs/CHAT_TOOLS_PLAN.md 4.5).
  | { id: string; role: "assistant"; kind: "notice"; text: string; tone: "info" | "error" | "success" | "crisis"; href?: string; hrefLabel?: string };

export type Busy = { kind: "run" | "reply"; label: string; detail?: string } | null;

export type StoredChat<Result, Run, Extra> = { v: 1; savedAt: number; messages: ChatMessage<Result, Run>[]; extra: Extra };

const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const KEEP_MESSAGES = 120;
const FRIENDLY = "Something went wrong on our end. Your chat is still here. Try again in a few seconds.";
const OFFLINE = "That didn't go through. Check your connection and try again.";

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const storageKey = (tool: ChatToolId, userId: string) => `mv.chat.v1.${tool}.${userId}`;

// "local": kept in the browser for 7 days. "session": kept only in the open
// tab, gone when it closes (the VA chat, D9: symptom details stay off shared
// computers).
export type ChatStorage = "local" | "session";
const storeFor = (storage: ChatStorage) => (storage === "session" ? window.sessionStorage : window.localStorage);

/**
 * The chat this member left on this device, if any and under 7 days old. Read
 * only in the browser, when the chat's state is first created; an answer cut
 * off by a reload is kept as stopped.
 */
export function readChat<Result, Run, Extra>(tool: ChatToolId, userId: string, storage: ChatStorage = "local"): StoredChat<Result, Run, Extra> | null {
  try {
    const raw = storeFor(storage).getItem(storageKey(tool, userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as StoredChat<Result, Run, Extra>;
    if (value?.v !== 1 || !Array.isArray(value.messages) || Date.now() - value.savedAt > KEEP_MS) return null;
    return {
      ...value,
      messages: value.messages.map((m) => (m.role === "assistant" && m.kind === "text" && m.streaming ? { ...m, streaming: false, stopped: true } : m)),
    };
  } catch {
    return null;
  }
}

const subscribeNever = () => () => {};
/** False on the server and while the page hydrates, then true: the chat renders from browser storage only then. */
export function useBrowserReady(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

export function useChatSession<Result, Run, Extra>(args: {
  tool: ChatToolId;
  userId: string;
  // What readChat returned when the page opened.
  initial: StoredChat<Result, Run, Extra> | null;
  // The member's inputs and latest result, sent with each follow-up.
  context: () => unknown;
  // Tool state kept with the messages (the inputs, for one).
  extra: Extra;
  storage?: ChatStorage;
}) {
  const storage = args.storage ?? "local";
  const key = storageKey(args.tool, args.userId);
  const [messages, setMessages] = useState<ChatMessage<Result, Run>[]>(() => args.initial?.messages ?? []);
  const [busy, setBusy] = useState<Busy>(null);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(messages);
  useEffect(() => {
    latest.current = messages;
  }, [messages]);

  useEffect(() => {
    try {
      if (messages.length === 0) storeFor(storage).removeItem(key);
      else storeFor(storage).setItem(key, JSON.stringify({ v: 1, savedAt: Date.now(), messages: messages.slice(-KEEP_MESSAGES), extra: args.extra }));
    } catch {
      // Private browsing or a full store: the chat still works, it just is not kept.
    }
  }, [key, messages, args.extra, storage]);

  const push = useCallback((message: ChatMessage<Result, Run>) => setMessages((prev) => [...prev, message]), []);
  const patch = useCallback(
    (id: string, change: Partial<ChatMessage<Result, Run>>) => setMessages((prev) => prev.map((m) => (m.id === id ? ({ ...m, ...change } as ChatMessage<Result, Run>) : m))),
    [],
  );

  /** A fresh signal for the next run or answer; Stop aborts it. */
  const begin = useCallback(() => {
    controller.current?.abort();
    controller.current = new AbortController();
    return controller.current.signal;
  }, []);
  const stop = useCallback(() => controller.current?.abort(), []);

  const reset = useCallback(() => {
    controller.current?.abort();
    setBusy(null);
    setMessages([]);
  }, []);

  /**
   * Ask a follow-up question; the answer streams into a new message. between:
   * a message to show right after the question, before the answer (the VA
   * chat's crisis card, so it follows the words that called for it).
   */
  const ask = useCallback(
    async (question: string, retryOf?: string, between?: ChatMessage<Result, Run>) => {
      const text = question.trim();
      if (!text || busy) return;
      // A retry resends the question that failed, so the history stops before it.
      const at = retryOf ? latest.current.findIndex((m) => m.id === retryOf) : -1;
      const history = at >= 0 ? latest.current.slice(0, Math.max(0, at - 1)) : latest.current;
      const turns = history
        .flatMap((m): { role: "user" | "assistant"; content: string }[] => {
          if (m.role === "user") return m.paste ? [] : [{ role: "user" as const, content: m.text.slice(0, CHAT_TURN_CHARS) }];
          if (m.kind === "text" && !m.error && !m.streaming && !m.local && m.text.trim()) return [{ role: "assistant" as const, content: m.text.slice(0, CHAT_TURN_CHARS) }];
          return [];
        })
        .slice(-CHAT_TURNS_SENT);
      const answerId = newId();
      if (retryOf) setMessages((prev) => prev.filter((m) => m.id !== retryOf));
      else push({ id: newId(), role: "user", text });
      if (between) push(between);
      push({ id: answerId, role: "assistant", kind: "text", text: "", streaming: true, question: text });
      setBusy({ kind: "reply", label: "Writing an answer" });
      const signal = begin();
      let answer = "";
      let finished = false;
      try {
        const res = await fetch(`/api/chat/${args.tool}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, turns, context: args.context() }),
          signal,
        });
        if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").includes("text/event-stream")) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          patch(answerId, { streaming: false, error: typeof data.error === "string" ? data.error : FRIENDLY });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const handle = (event: ChatEvent) => {
          if (event.type === "delta") {
            answer += event.text;
            patch(answerId, { text: answer });
          } else if (event.type === "done") {
            finished = true;
            patch(answerId, { streaming: false, suggestions: event.suggestions, run: (event.run as Run | null) ?? null });
          } else if (event.type === "error") {
            finished = true;
            patch(answerId, { streaming: false, error: event.error });
          }
        };
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = readEvents(buffer);
          buffer = rest;
          events.forEach(handle);
        }
        readEvents(buffer + "\n\n").events.forEach(handle);
        if (!finished) patch(answerId, answer ? { streaming: false, stopped: true } : { streaming: false, error: FRIENDLY });
      } catch {
        if (signal.aborted) patch(answerId, { streaming: false, stopped: true });
        else patch(answerId, { streaming: false, error: OFFLINE });
      } finally {
        setBusy(null);
      }
    },
    [args, busy, begin, patch, push],
  );

  /** Download the chat as a Word file, or save it to My Files. */
  const exportChat = useCallback(async (mode: "download" | "save", transcript: Transcript): Promise<{ ok: true; fileName?: string } | { ok: false; error: string }> => {
    try {
      const res = await fetch("/api/chat/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: args.tool, mode, savedOn: new Date().toLocaleDateString("en-CA"), ...transcript }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: typeof data.error === "string" ? data.error : FRIENDLY };
      }
      if (mode === "save") {
        const data = (await res.json()) as { fileName?: string };
        return { ok: true, fileName: data.fileName };
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "milvector_chat.docx";
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return { ok: true, fileName: name };
    } catch {
      return { ok: false, error: OFFLINE };
    }
  }, [args.tool]);

  return { messages, setMessages, push, patch, busy, setBusy, begin, stop, reset, ask, exportChat };
}

export const CHAT_ERRORS = { friendly: FRIENDLY, offline: OFFLINE };
