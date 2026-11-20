import type { CSSProperties, ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import type { InviteData, InviteViewName } from "@/lib/invites/schema";
import type { InviteColors } from "@/lib/invites/templates";
import { formatDateLong, formatTime } from "@/lib/invites/time";
import { dayAtAGlance } from "@/lib/invites/view";

// Sections of the guest page added in Phase C. Server-safe: no hooks.

export type SectionStyle = { colors: InviteColors; heading: CSSProperties; upper: boolean };

export function SectionHead({ title, style }: { title: string; style: SectionStyle }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-0.5 w-6 shrink-0" style={{ background: style.colors.accentText }} aria-hidden="true" />
      <h2 className={`text-2xl font-bold @2xl:text-3xl ${style.upper ? "uppercase tracking-tight" : ""}`} style={style.heading}>
        {title}
      </h2>
    </div>
  );
}

export function Section({ id, title, intro, style, children }: { id?: string; title: string; intro?: ReactNode; style: SectionStyle; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4">
      <SectionHead title={title} style={style} />
      {intro ? (
        <p className="mt-3 leading-relaxed" style={{ color: style.colors.muted }}>
          {intro}
        </p>
      ) : null}
      {children}
    </section>
  );
}

// ─── The day at a glance ──────────────────────────────────────────────

export function GlanceSection({ data, style }: { data: InviteData; style: SectionStyle }) {
  const lines = dayAtAGlance(data);
  if (lines.length < 2) return null;
  const c = style.colors;
  const multiDay = new Set(lines.map((line) => line.date)).size > 1;
  return (
    <Section title="The day at a glance" style={style}>
      <ol className="mt-5 border-l-2 pl-5" style={{ borderColor: c.line }}>
        {lines.map((line) => (
          <li key={line.key} className="relative pb-5 last:pb-0">
            <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full" style={{ background: c.accent }} aria-hidden="true" />
            <p className="text-sm font-bold tabular-nums" style={{ color: c.accentText }}>
              {multiDay ? `${formatDateLong(line.date).split(",")[0]} ` : ""}
              {line.time ? formatTime(line.time, data.timeFormat) : ""}
            </p>
            <p className="font-semibold">{line.title}</p>
            {line.detail && (
              <p className="whitespace-pre-line text-sm" style={{ color: c.muted }}>
                {line.detail}
              </p>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

// ─── Program ──────────────────────────────────────────────────────────

const PROGRAM_TITLES: Record<InviteViewName, string> = { invite: "The program", eventday: "Sequence of events", memories: "How it went" };

export function hasProgram(data: InviteData): boolean {
  const p = data.program;
  return data.sections.program && (p.items.length > 0 || p.people.length > 0 || p.bios.length > 0);
}

// With no sequence written yet, the section is named for what it holds.
function programTitle(data: InviteData, view: InviteViewName): string {
  const { items, people, bios } = data.program;
  if (items.length > 0) return PROGRAM_TITLES[view];
  if (people.length > 0) return "The official party";
  return bios.length === 1 ? "Biography" : "Biographies";
}

export function ProgramSection({ data, view, style }: { data: InviteData; view: InviteViewName; style: SectionStyle }) {
  if (!hasProgram(data)) return null;
  const { items, note, people, bios } = data.program;
  const c = style.colors;
  return (
    <Section id="program" title={programTitle(data, view)} style={style} intro={view === "memories" ? "The program from the day, kept as a record." : undefined}>
      {note && view !== "memories" && (
        <p className="mt-4 rounded-xl border-l-4 px-4 py-3 text-sm font-semibold" style={{ borderColor: c.accent, background: c.surface }}>
          {note}
        </p>
      )}
      {items.length > 0 && (
        <ol className="mt-5 grid gap-2">
          {items.map((item) =>
            item.kind === "heading" ? (
              <li key={item.id} className="pt-4">
                <h3 className={`text-lg font-bold ${style.upper ? "uppercase tracking-tight" : ""}`} style={style.heading}>
                  {item.title}
                </h3>
                {item.who && (
                  <p className="text-sm" style={{ color: c.muted }}>
                    {item.who}
                  </p>
                )}
              </li>
            ) : (
              <li key={item.id} className="rounded-xl border px-4 py-3" style={{ borderColor: c.line, background: c.surface }}>
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <p className="font-semibold">{item.title}</p>
                  {item.cue && view !== "memories" && (
                    <span className="shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.08em]" style={{ borderColor: c.accentText, color: c.accentText }}>
                      {item.cue}
                    </span>
                  )}
                </div>
                {item.who && (
                  <p className="mt-0.5 text-sm" style={{ color: c.muted }}>
                    {item.who}
                  </p>
                )}
              </li>
            ),
          )}
        </ol>
      )}

      {people.length > 0 && (
        <div className="mt-8">
          <h3 className={`text-lg font-bold ${style.upper ? "uppercase tracking-tight" : ""}`} style={style.heading}>
            Key personnel
          </h3>
          <div className="mt-3 grid gap-3 @md:grid-cols-2">
            {people.map((person) => (
              <div key={person.id} className="rounded-xl border p-4" style={{ borderColor: c.line, background: c.surface }}>
                <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: c.accentText }}>
                  {person.role}
                </p>
                <p className="mt-1 font-semibold">{person.name}</p>
                {person.line && (
                  <p className="text-sm" style={{ color: c.muted }}>
                    {person.line}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {bios.length > 0 && (
        <div className="mt-8 grid gap-4">
          {bios.map((bio) => (
            <article key={bio.id} className="rounded-2xl border p-5" style={{ borderColor: c.line, background: c.surface }}>
              {bio.role && (
                <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: c.accentText }}>
                  {bio.role}
                </p>
              )}
              <h3 className={`mt-1 text-xl font-bold ${style.upper ? "uppercase tracking-tight" : ""}`} style={style.heading}>
                {bio.name}
              </h3>
              {bio.short && <p className="mt-3 whitespace-pre-line leading-relaxed">{bio.short}</p>}
              {bio.full && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-bold" style={{ color: c.accentText }}>
                    Read the full biography
                  </summary>
                  <p className="mt-3 whitespace-pre-line leading-relaxed">{bio.full}</p>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── Guest information ────────────────────────────────────────────────

export function InfoSection({ data, style, framed }: { data: InviteData; style: SectionStyle; framed: boolean }) {
  if (!data.sections.info || data.info.length === 0) return null;
  const c = style.colors;
  const inert = framed ? { tabIndex: -1, "aria-disabled": true } : {};
  return (
    <Section id="info" title="For your visit" style={style}>
      <div className="mt-5 grid gap-4">
        {data.info.map((block) => (
          <article key={block.id} className="rounded-2xl border p-5" style={{ borderColor: c.line, background: c.surface }}>
            <h3 className={`text-lg font-bold ${style.upper ? "uppercase tracking-tight" : ""}`} style={style.heading}>
              {block.title}
            </h3>
            {block.body && <p className="mt-2 whitespace-pre-line leading-relaxed">{block.body}</p>}
            {block.linkUrl && (
              <a
                href={block.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
                style={{ borderColor: c.line, background: c.bg }}
                {...inert}
              >
                <ExternalLink size={16} aria-hidden="true" />
                {block.linkLabel || "Open the link"}
              </a>
            )}
          </article>
        ))}
      </div>
    </Section>
  );
}

// ─── Career photos ────────────────────────────────────────────────────

export type PagePhoto = { id: string; caption: string; src: string };

export function PhotosSection({ data, photos, style, framed }: { data: InviteData; photos: PagePhoto[]; style: SectionStyle; framed: boolean }) {
  if (!data.sections.photos || photos.length === 0) return null;
  const c = style.colors;
  return (
    <Section id="photos" title="Along the way" style={style}>
      <div className="mt-5 grid grid-cols-2 gap-2 @2xl:grid-cols-3">
        {photos.map((photo, index) => (
          <figure key={photo.id} className={index === 0 ? "col-span-2" : ""}>
            <a href={photo.src} target="_blank" rel="noopener noreferrer" {...(framed ? { tabIndex: -1, "aria-disabled": true } : {})}>
              {/* eslint-disable-next-line @next/next/no-img-element -- member photo from the invite route */}
              <img
                src={photo.src}
                alt={photo.caption || "A photo from the retiree's career"}
                loading="lazy"
                decoding="async"
                // Same-shape tiles, trimmed from the bottom first so a portrait
                // keeps the face. A tap opens the whole photo.
                className="aspect-[4/3] w-full rounded-xl object-cover object-[50%_20%]"
                style={{ background: c.surface }}
              />
            </a>
            {photo.caption && (
              <figcaption className="mt-1 text-xs leading-snug" style={{ color: c.muted }}>
                {photo.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </Section>
  );
}
