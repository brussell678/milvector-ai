import type { CSSProperties, ReactNode } from "react";
import { Briefcase, Calendar, ExternalLink, FileText, Globe, Link2, Mail, MapPin, MessageSquare, Phone } from "lucide-react";
import { LINK_TYPE_LABELS, telDigits, textOnColor, type CardData, type LinkType } from "@/lib/cards/schema";

// The card itself. Used by the public page and by the live preview in the
// editor, so what a member designs is exactly what a visitor sees. It carries
// its own colors and ignores the site's light or dark theme.

const LINK_ICONS: Record<LinkType, typeof Link2> = {
  linkedin: Briefcase,
  website: Globe,
  calendar: Calendar,
  resume: FileText,
  portfolio: FileText,
  github: Link2,
  social: Link2,
  other: Link2,
};

function palette(card: CardData): CSSProperties {
  const dark = card.style === "dark";
  return {
    "--card-accent": card.accent,
    "--card-on-accent": textOnColor(card.accent),
    "--card-bg": dark ? "#10151f" : "#ffffff",
    "--card-fg": dark ? "#f3f5f9" : "#0f172a",
    "--card-muted": dark ? "#a3adc0" : "#526072",
    "--card-line": dark ? "#273042" : "#e2e7ee",
    "--card-soft": dark ? "#1a2130" : "#f4f6f9",
    "--card-icon": dark ? `color-mix(in oklab, ${card.accent} 45%, #ffffff)` : card.accent,
  } as CSSProperties;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}


export function CardView({
  card,
  photoSrc,
  bannerSrc,
  resume,
  children,
}: {
  card: CardData;
  photoSrc?: string | null;
  // The banner image (LinkedIn's 4:1 shape). It replaces the color band.
  bannerSrc?: string | null;
  // The attached resume. `href` is omitted in the editor preview.
  resume?: { href?: string; isPdf: boolean } | null;
  children?: ReactNode;
}) {
  const quick = [
    card.phone && { href: `tel:${telDigits(card.phone)}`, label: "Call", Icon: Phone },
    card.phone && { href: `sms:${telDigits(card.phone)}`, label: "Text", Icon: MessageSquare },
    card.email && { href: `mailto:${card.email}`, label: "Email", Icon: Mail },
    card.website && { href: card.website, label: "Website", Icon: Globe, external: true },
  ].filter(Boolean) as { href: string; label: string; Icon: typeof Phone; external?: boolean }[];

  const subtitle = [card.title, card.company].filter(Boolean).join(" · ");

  return (
    <article
      style={{ ...palette(card), background: "var(--card-bg)", color: "var(--card-fg)", borderColor: "var(--card-line)" }}
      className="w-full overflow-hidden rounded-3xl border shadow-xl"
    >
      {bannerSrc ? (
        // Exactly 4:1, LinkedIn's banner shape, so a LinkedIn banner shows whole.
        <div className="w-full" style={{ aspectRatio: "4 / 1", background: "var(--card-soft)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- member banner served from a card route or a local preview */}
          <img src={bannerSrc} alt="" width={1584} height={396} className="block h-full w-full object-cover" data-card-banner="" />
        </div>
      ) : card.style === "clean" ? (
        <div className="h-14" style={{ borderTop: "6px solid var(--card-accent)" }} />
      ) : (
        <div
          className="h-28"
          style={{
            background:
              card.style === "dark"
                ? "linear-gradient(135deg, var(--card-accent), color-mix(in oklab, var(--card-accent) 35%, #10151f))"
                : "linear-gradient(135deg, var(--card-accent), color-mix(in oklab, var(--card-accent) 72%, #000))",
          }}
        />
      )}

      <div className={`relative px-6 pb-7 ${card.style === "clean" && !bannerSrc ? "-mt-6" : "-mt-14"}`}>
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- member photo served from a card route or a local preview
          <img
            src={photoSrc}
            alt={`Photo of ${card.name}`}
            width={104}
            height={104}
            className="h-[104px] w-[104px] rounded-full object-cover"
            style={{ border: "4px solid var(--card-bg)", background: "var(--card-soft)" }}
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-[104px] w-[104px] items-center justify-center rounded-full text-3xl font-extrabold"
            style={{ border: "4px solid var(--card-bg)", background: "var(--card-accent)", color: "var(--card-on-accent)" }}
          >
            {initials(card.name) || "?"}
          </div>
        )}

        <h1 className="mt-4 text-2xl font-extrabold leading-tight" style={{ overflowWrap: "anywhere" }}>
          {card.name || "Your Name"}
        </h1>
        {subtitle && (
          <p className="mt-1 text-base font-semibold" style={{ color: "var(--card-muted)", overflowWrap: "anywhere" }}>
            {subtitle}
          </p>
        )}
        {card.service && (
          <p
            className="mt-3 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em]"
            style={{ background: "var(--card-soft)", color: "var(--card-fg)", border: "1px solid var(--card-line)" }}
          >
            {card.service}
          </p>
        )}
        {card.headline && (
          <p className="mt-3 text-[0.95rem] leading-relaxed" style={{ overflowWrap: "anywhere" }}>
            {card.headline}
          </p>
        )}
        {card.location && (
          <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: "var(--card-muted)" }}>
            <MapPin size={14} aria-hidden="true" />
            {card.location}
          </p>
        )}

        {children && <div className="mt-5">{children}</div>}

        {quick.length > 0 && (
          <div className="mt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${quick.length}, minmax(0, 1fr))` }}>
            {quick.map(({ href, label, Icon, external }) => (
              <a
                key={label}
                href={href}
                data-card-link={label.toLowerCase()}
                {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
                className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold"
                style={{ background: "var(--card-soft)", color: "var(--card-fg)", border: "1px solid var(--card-line)" }}
              >
                <Icon size={18} aria-hidden="true" style={{ color: "var(--card-icon)" }} />
                {label}
              </a>
            ))}
          </div>
        )}

        {resume && (
          <a
            href={resume.href}
            data-card-resume=""
            className="mt-4 flex min-h-[52px] items-center gap-3 rounded-2xl px-4 text-sm font-bold"
            style={{ background: "var(--card-soft)", color: "var(--card-fg)", border: "1px solid var(--card-accent)" }}
          >
            <FileText size={18} aria-hidden="true" style={{ color: "var(--card-icon)" }} />
            <span className="flex-1">Download my resume</span>
            <span className="text-xs font-semibold" style={{ color: "var(--card-muted)" }}>
              {resume.isPdf ? "PDF" : "Word"}
            </span>
          </a>
        )}

        {card.links.length > 0 && (
          <ul className="mt-4 space-y-2">
            {card.links.map((link, index) => {
              const Icon = LINK_ICONS[link.type];
              return (
                <li key={`${link.url}-${index}`}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                    data-card-link={link.type}
                    className="flex min-h-[52px] items-center gap-3 rounded-2xl px-4 text-sm font-bold"
                    style={{ background: "var(--card-soft)", color: "var(--card-fg)", border: "1px solid var(--card-line)" }}
                  >
                    <Icon size={18} aria-hidden="true" style={{ color: "var(--card-icon)" }} />
                    <span className="flex-1" style={{ overflowWrap: "anywhere" }}>
                      {link.label || LINK_TYPE_LABELS[link.type]}
                    </span>
                    <ExternalLink size={14} aria-hidden="true" style={{ color: "var(--card-muted)" }} />
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        {card.bio && (
          <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--card-line)" }}>
            <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: "var(--card-muted)" }}>
              About
            </p>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed" style={{ overflowWrap: "anywhere" }}>
              {card.bio}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
