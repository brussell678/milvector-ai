"use client";

import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import type { InviteViewName } from "@/lib/invites/schema";
import { youtubeId } from "@/lib/invites/view";

const TITLES: Record<InviteViewName, string> = { invite: "Watching from somewhere else", eventday: "Watch it live", memories: "Watch the recording" };

// The live stream. The YouTube player does not exist until someone taps it:
// on the day, the page is the program in a hundred hands on the ramp, and a
// player that started on its own would feed ceremony audio back into the
// microphone. No autoplay, no preloaded player, no third-party requests
// before the tap.
export function StreamPlayer({ url, view, framed, heading }: { url: string; view: InviteViewName; framed: boolean; heading: React.ReactNode }) {
  const [playing, setPlaying] = useState(false);
  const id = youtubeId(url);

  return (
    <section id="stream" className="scroll-mt-4">
      {heading}
      <p className="mt-3 leading-relaxed text-[var(--iv-muted)]">
        {view === "invite"
          ? "The ceremony will be streamed for family and friends who cannot be there."
          : view === "eventday"
            ? "For everyone watching from somewhere else."
            : "The ceremony, for anyone who missed it or wants to watch again."}
      </p>
      <span className="sr-only">{TITLES[view]}</span>

      {id ? (
        <div className="relative mt-5 aspect-video w-full overflow-hidden rounded-2xl border border-[var(--iv-line)] bg-black">
          {playing ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
              title="Ceremony stream"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          ) : (
            <button
              type="button"
              onClick={() => !framed && setPlaying(true)}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white"
              aria-label="Play the stream"
              tabIndex={framed ? -1 : undefined}
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "var(--iv-accent)", color: "var(--iv-on-accent)" }}>
                <Play size={28} aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold">Tap to play</span>
            </button>
          )}
        </div>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl px-6 text-base font-bold"
          style={{ background: "var(--iv-accent)", color: "var(--iv-on-accent)" }}
          {...(framed ? { tabIndex: -1, "aria-disabled": true } : {})}
        >
          <ExternalLink size={18} aria-hidden="true" />
          Open the stream
        </a>
      )}

      {view === "eventday" && (
        <p className="mt-3 text-sm text-[var(--iv-muted)]">
          At the ceremony? Please leave this closed. Out in the open, a phone playing the stream sends the sound straight back into the microphone.
        </p>
      )}
      {id && (
        <p className="mt-2 text-xs text-[var(--iv-muted)]">
          Trouble with the player?{" "}
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--iv-accent-text)] underline" {...(framed ? { tabIndex: -1 } : {})}>
            Open it on YouTube
          </a>
          .
        </p>
      )}
    </section>
  );
}
