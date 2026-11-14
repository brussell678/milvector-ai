import { notFound } from "next/navigation";
import { BusinessCardBuilder } from "@/components/business-card-builder";
import { cardBuilderEnabled } from "@/lib/cards/access";
import { supabaseServer } from "@/lib/supabase/server";

export default async function BusinessCardPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !cardBuilderEnabled(user.email)) notFound();

  return (
    <main className="page-shell">
      <section className="page-hero-dark">
        <div className="page-hero-grid">
          <div className="relative z-10">
            <p className="page-kicker-pill">DIGITAL BUSINESS CARD · PREVIEW</p>
            <h1 className="page-title">
              One card you never run out of, <span className="gradient-text">shared with a scan or a tap.</span>
            </h1>
            <p className="page-description">
              Build a card for job fairs, networking events, and informational interviews. Share it by link, QR code, phone wallet, or NFC tag, and
              see who sent their details back.
            </p>
          </div>
          <aside className="page-hero-aside relative z-10">
            <p className="page-hero-aside-title">WHAT YOU GET</p>
            <ul className="page-hero-list">
              <li>A personal card page with one-tap Save Contact</li>
              <li>A QR code in your color, for screens and print</li>
              <li>Apple Wallet and Google Wallet passes</li>
              <li>Contact exchange, view counts, and an email signature</li>
            </ul>
          </aside>
        </div>
      </section>

      <BusinessCardBuilder />
    </main>
  );
}
