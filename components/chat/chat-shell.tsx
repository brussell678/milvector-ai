"use client";

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, FilePlus2, RotateCcw, Square } from "lucide-react";

// The chat box every chat tool uses (docs/CHAT_TOOLS_PLAN.md, Layout): a bar
// with Download, Save to My Files, and New chat; a thread that scrolls on its
// own; and a reply box that hovers over the bottom of the thread, with the
// suggestion chips just above it. The thread follows new text while the
// member is at the bottom, and offers "Jump to latest" when they scroll up.

type Props = {
  title: string;
  children: ReactNode;
  suggestions?: string[];
  onSuggestion?: (text: string) => void;
  onSend: (text: string) => void;
  // Something is working: the send button becomes Stop.
  working: boolean;
  onStop: () => void;
  placeholder: string;
  canExport: boolean;
  exporting: "download" | "save" | null;
  onDownload: () => void;
  onSave: () => void;
  onNew: () => void;
  // Changes when a run starts, to bring the box into view on a phone.
  focusKey?: number;
};

const NEAR_BOTTOM_PX = 96;

export function ChatShell(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [draft, setDraft] = useState("");

  const toBottom = useCallback((smooth = false) => {
    const el = thread.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Follow the conversation as it grows, unless the member scrolled up to read.
  useEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) toBottom();
      else setShowJump(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [toBottom]);

  // The thread leaves room under its last message for the hovering dock.
  useLayoutEffect(() => {
    const el = dock.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => box.current?.style.setProperty("--dock-h", `${el.offsetHeight}px`));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // On a phone the box is as tall as what is visible, so the keyboard never hides the reply box.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const set = () => box.current?.style.setProperty("--chat-vh", `${Math.round(vv.height)}px`);
    set();
    vv.addEventListener("resize", set);
    return () => vv.removeEventListener("resize", set);
  }, []);

  useEffect(() => {
    if (!props.focusKey) return;
    if (window.matchMedia("(max-width: 767px)").matches) box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    atBottom.current = true;
    toBottom(true);
  }, [props.focusKey, toBottom]);

  // Only the member scrolling up stops the thread following new text. A smooth
  // scroll to the bottom passes through the middle of the thread on its way
  // down, and must not be read as the member leaving the bottom.
  const lastTop = useRef(0);
  function onScroll() {
    const el = thread.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (near) {
      atBottom.current = true;
      setShowJump(false);
    } else if (el.scrollTop < lastTop.current - 2) {
      atBottom.current = false;
    }
    lastTop.current = el.scrollTop;
  }

  function grow() {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }

  function send() {
    const text = draft.trim();
    if (!text || props.working) return;
    props.onSend(text);
    setDraft("");
    atBottom.current = true;
    requestAnimationFrame(() => {
      grow();
      toBottom(true);
    });
  }

  return (
    <section ref={box} className="chat-box" aria-label={props.title}>
      <div className="chat-bar">
        <p className="text-sm font-bold">{props.title}</p>
        <div className="chat-bar-actions">
          <button type="button" className="chat-bar-button" onClick={props.onDownload} disabled={!props.canExport || !!props.exporting} title="Download this chat as a Word file">
            <Download size={15} aria-hidden="true" />
            {props.exporting === "download" ? "Preparing" : "Download"}
          </button>
          <button type="button" className="chat-bar-button" onClick={props.onSave} disabled={!props.canExport || !!props.exporting} title="Save this chat to My Files as a Word file">
            <FilePlus2 size={15} aria-hidden="true" />
            {props.exporting === "save" ? "Saving" : "Save"}
            <span className="sr-only"> to My Files</span>
          </button>
          <button type="button" className="chat-bar-button" onClick={props.onNew} title="Start a new chat">
            <RotateCcw size={15} aria-hidden="true" />
            New
            <span className="sr-only"> chat</span>
          </button>
        </div>
      </div>

      <div ref={thread} className="chat-thread" onScroll={onScroll} role="log" aria-live="polite" aria-busy={props.working}>
        <div ref={inner} className="chat-thread-inner">
          {props.children}
        </div>
      </div>

      {showJump && (
        <button
          type="button"
          className="chat-jump"
          onClick={() => {
            atBottom.current = true;
            setShowJump(false);
            toBottom(true);
          }}
        >
          <ArrowDown size={14} className="mr-1 inline" aria-hidden="true" />
          Jump to latest
        </button>
      )}

      <div ref={dock} className="chat-dock">
        {props.suggestions && props.suggestions.length > 0 && !props.working && (
          <div className="chat-chips" role="group" aria-label="Suggested questions">
            {props.suggestions.map((s) => (
              <button key={s} type="button" className="chat-chip" title={s} onClick={() => props.onSuggestion?.(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Your message
          </label>
          <textarea
            id="chat-input"
            ref={input}
            rows={1}
            value={draft}
            enterKeyHint="send"
            placeholder={props.placeholder}
            maxLength={2000}
            onChange={(e) => {
              setDraft(e.target.value);
              grow();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          {props.working ? (
            <button type="button" className="chat-send" data-stop="true" onClick={props.onStop} aria-label="Stop">
              <Square size={14} fill="currentColor" aria-hidden="true" />
            </button>
          ) : (
            <button type="submit" className="chat-send" disabled={!draft.trim()} aria-label="Send">
              <ArrowUp size={18} aria-hidden="true" />
            </button>
          )}
        </form>
      </div>
    </section>
  );
}
