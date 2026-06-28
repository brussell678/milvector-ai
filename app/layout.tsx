import type { Metadata } from "next";
import { Barlow, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import Image from "next/image";
import { DesktopNav } from "@/components/layout/desktop-nav";
import { MobileSiteHeader } from "@/components/layout/mobile-site-header";
import { PublicSiteChrome } from "@/components/layout/public-site-chrome";
import { TopBanner } from "@/components/layout/top-banner";
import { ScrollObserver } from "@/components/scroll-observer";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "MilVector AI",
  description: "Connected transition planning, document workflows, and AI support for service members moving into civilian careers.",
  icons: {
    icon: "/assets/milvector-ai-logo-transparent.png",
  },
};

const footerNav = [
  { href: "/", label: "Home" },
  { href: "/platform", label: "Why MilVector" },
  { href: "/knowledge-base", label: "Knowledge Base" },
  { href: "/library", label: "Resource Library" },
  { href: "/message-board", label: "Community" },
];

const footerSupport = [
  { href: "/donate", label: "Donate" },
  { href: "/feedback", label: "Give Feedback" },
  { href: "/privacy", label: "Privacy Policy" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${barlow.variable} ${plexMono.variable} antialiased`}>
        <div className="site-watermark" aria-hidden="true" />
        <ScrollObserver />
        <TopBanner />
        <PublicSiteChrome>
          <MobileSiteHeader />
          <DesktopNav />
        </PublicSiteChrome>
        <div className="relative z-10 pb-0 pt-4">{children}</div>

        <footer className="site-footer">
          <div className="mx-auto max-w-6xl">

            {/* 3-column grid */}
            <div className="grid gap-10 sm:grid-cols-3">

              {/* Brand */}
              <div>
                <Link href="/" className="inline-flex items-center gap-2.5">
                  <Image
                    src="/assets/milvector-ai-logo-transparent.png"
                    alt=""
                    width={24}
                    height={24}
                    className="object-contain opacity-80"
                    aria-hidden="true"
                  />
                  <span className="font-extrabold tracking-wide text-white">
                    MILVECTOR AI
                  </span>
                </Link>
                <p
                  className="mt-1 text-xs font-bold uppercase tracking-[0.16em]"
                  style={{ color: "#39a67f" }}
                >
                  Built for service members
                </p>
                <p className="mt-3 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Career translation, job targeting, and transition planning — AI-powered and built for service members.
                </p>
              </div>

              {/* Navigate */}
              <nav aria-label="Footer navigation">
                <p
                  className="text-xs font-bold uppercase tracking-[0.16em]"
                  style={{ color: "rgba(255,255,255,0.32)" }}
                >
                  Navigate
                </p>
                <ul className="mt-4 space-y-2.5">
                  {footerNav.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-sm">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              {/* Support */}
              <div>
                <p
                  className="text-xs font-bold uppercase tracking-[0.16em]"
                  style={{ color: "rgba(255,255,255,0.32)" }}
                >
                  Support
                </p>
                <ul className="mt-4 space-y-2.5">
                  {footerSupport.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-sm">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <a
                      href="https://www.russell-innovation-group.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm"
                    >
                      Russell Innovation Group
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            {/* Bottom bar */}
            <div
              className="mt-10 pt-5 text-xs"
              style={{
                borderTop: "1px solid rgba(255,255,255,0.07)",
                color: "rgba(255,255,255,0.22)",
              }}
            >
              <p>Copyright 2026 MilVector AI · Built by Russell Innovation Group LLC</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
