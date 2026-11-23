import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { AdminCardControls } from "@/components/cards/admin-card-controls";
import { CardActions } from "@/components/cards/card-actions";
import { CardView } from "@/components/cards/card-view";
import { cardUrl } from "@/lib/cards/access";
import { qrColor, readSource } from "@/lib/cards/schema";
import { loadCardBannerVersion, loadCardForViewer, loadCardResumeName } from "@/lib/cards/store";
import { supabaseServer } from "@/lib/supabase/server";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ s?: string }> };

// Cards are personal pages. They are reachable by link or QR code but kept out
// of search engines, so a member's phone number is not one search away.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const loaded = await loadCardForViewer(supabase, slug);
  const robots = { index: false, follow: false };
  if (!loaded) return { title: "Card not found", robots };
  const subtitle = [loaded.card.title, loaded.card.company].filter(Boolean).join(", ");
  return {
    title: { absolute: `${loaded.card.name}${subtitle ? ` | ${subtitle}` : ""}` },
    description: loaded.card.headline || `Digital business card for ${loaded.card.name}.`,
    robots,
    openGraph: {
      title: loaded.card.name,
      description: subtitle || "Digital business card",
      type: "profile",
      ...(loaded.hasPhoto ? { images: [{ url: `/c/${loaded.slug}/photo`, width: 400, height: 400 }] } : {}),
    },
  };
}

export default async function CardPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { s } = await searchParams;
  const supabase = await supabaseServer();
  const loaded = await loadCardForViewer(supabase, slug);
  if (!loaded) notFound();

  const { card } = loaded;
  const [resumeName, bannerVersion] = await Promise.all([loadCardResumeName(supabase, loaded.slug), loadCardBannerVersion(supabase, loaded.slug)]);
  const qrSvg = await QRCode.toString(cardUrl(loaded.slug, "qr"), {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: qrColor(card.accent), light: "#ffffff" },
  });

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col gap-4 px-4 pb-10">
      {loaded.state !== "live" && (
        <div className="tool-alert" data-variant="warn" role="status">
          <p className="tool-alert-title">{loaded.state === "suspended" ? "This card is suspended" : "Draft preview"}</p>
          <div>
            {loaded.state === "suspended"
              ? "Visitors cannot see this card. Contact support if you think this is a mistake."
              : "Only you can see this. Publish the card in the editor to share it."}
          </div>
        </div>
      )}
      {loaded.viewer === "admin" && <AdminCardControls cardId={loaded.id} suspended={loaded.state === "suspended"} />}

      <CardView
        card={card}
        photoSrc={loaded.hasPhoto ? `/c/${loaded.slug}/photo` : null}
        bannerSrc={bannerVersion ? `/c/${loaded.slug}/banner?t=${encodeURIComponent(bannerVersion)}` : null}
        resume={resumeName ? { href: `/c/${loaded.slug}/resume`, isPdf: resumeName.toLowerCase().endsWith(".pdf") } : null}
      >
        <CardActions
          slug={loaded.slug}
          ownerFirstName={card.name.trim().split(/\s+/)[0] ?? ""}
          source={readSource(s)}
          leadCapture={card.leadCapture && loaded.state === "live"}
          qrSvg={qrSvg}
          shareUrl={cardUrl(loaded.slug)}
          track={loaded.state === "live" && loaded.viewer === "public"}
        />
      </CardView>

      <footer className="mt-2 text-center text-xs text-[var(--muted)]">
        <p>
          <Link href="/" className="font-bold underline">
            Made with MilVector AI
          </Link>
          , free career tools for transitioning service members.
        </p>
        <p className="mt-1">
          Built by{" "}
          <a href="https://www.russell-innovation-group.com" target="_blank" rel="noopener noreferrer" className="font-bold underline">
            Russell Innovation Group
          </a>
        </p>
        <p className="mt-2">
          <Link href={`/feedback?card=${encodeURIComponent(loaded.slug)}`} className="underline">
            Report this card
          </Link>
        </p>
      </footer>
    </main>
  );
}
