import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { InviteView } from "@/components/invites/invite-view";
import { inviteUrl } from "@/lib/invites/access";
import { loadInviteForViewer } from "@/lib/invites/store";
import { inviteColors, readTemplate } from "@/lib/invites/templates";
import { ceremonyOf, eventIsComplete, formatDateLong, publicLocation } from "@/lib/invites/time";
import { supabaseServer } from "@/lib/supabase/server";

type Props = { params: Promise<{ slug: string }> };

// Invitations are personal pages. Reachable by link or QR code, kept out of
// search engines. Link previews in text messages still work.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const loaded = await loadInviteForViewer(supabase, slug);
  const robots = { index: false, follow: false };
  if (!loaded) return { title: "Invitation not found", robots };
  const { data } = loaded;
  const name = [data.retiree.rank, data.retiree.name].filter(Boolean).join(" ");
  const ceremony = ceremonyOf(data);
  const when = ceremony && eventIsComplete(ceremony) ? [formatDateLong(ceremony.date), publicLocation(ceremony)].filter(Boolean).join(". ") : "";
  const description = [when, data.welcome].filter(Boolean).join(". ");
  return {
    title: { absolute: `${name} | Retirement` },
    description,
    robots,
    openGraph: {
      title: `${name} | Retirement`,
      description,
      type: "website",
      ...(loaded.hasCover ? { images: [{ url: `/r/${loaded.slug}/cover?v=${encodeURIComponent(loaded.updatedAt)}` }] } : {}),
    },
  };
}

export default async function InvitePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const loaded = await loadInviteForViewer(supabase, slug);
  if (!loaded) notFound();

  const pageUrl = inviteUrl(loaded.slug);
  const colors = inviteColors(readTemplate(loaded.data.template), loaded.data.accent);
  const qrSvg = await QRCode.toString(pageUrl, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: colors.qr, light: "#ffffff" },
  });

  return (
    // Pulls up over the root layout's top padding so the template color runs edge to edge.
    <div className="-mt-4">
      {loaded.state !== "live" && (
        <div className="tool-alert !rounded-none" data-variant="warn" role="status">
          <p className="tool-alert-title">{loaded.state === "suspended" ? "This invitation is suspended" : "Draft preview"}</p>
          <div className="text-sm">
            {loaded.state === "suspended"
              ? "Guests cannot see this page. Contact support if you think this is a mistake."
              : "Only you can see this page until you publish it in the Retirement Invitation Builder."}
          </div>
        </div>
      )}
      <InviteView
        data={loaded.data}
        slug={loaded.slug}
        pageUrl={pageUrl}
        coverSrc={loaded.hasCover ? `/r/${loaded.slug}/cover?v=${encodeURIComponent(loaded.updatedAt)}` : null}
        qrSvg={qrSvg}
      />
    </div>
  );
}
