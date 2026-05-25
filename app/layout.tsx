import type { Metadata } from "next";
import { Barlow, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { DesktopNav } from "@/components/layout/desktop-nav";
import { MobileSiteHeader } from "@/components/layout/mobile-site-header";
import { PublicSiteChrome } from "@/components/layout/public-site-chrome";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${barlow.variable} ${plexMono.variable} antialiased`}>
        <div className="site-watermark" aria-hidden="true" />
        <div className="site-top-banner">
          <p>
            Built by Marines for service members. MilVector keeps transition planning, documents, and AI tools in one connected workspace.{" "}
            <Link href="/platform">How It Works</Link>
          </p>
        </div>
        <PublicSiteChrome>
          <MobileSiteHeader />
          <DesktopNav />
        </PublicSiteChrome>
        <div className="fixed right-4 top-32 z-50 md:top-24">
          <ThemeToggle />
        </div>
        <div className="relative z-10 pb-16 pt-28 md:pt-10">{children}</div>
        <footer className="site-footer">
          <p>
            Copyright 2026 MilVector AI. Built by{" "}
            <a href="https://www.russell-innovation-group.com" target="_blank" rel="noopener noreferrer">
              Russell Innovation Group LLC
            </a>{" "}
            {" | "}
            <Link href="/platform">How MilVector Works</Link>
            {" | "}
            <Link href="/privacy">Privacy</Link>.
          </p>
        </footer>
      </body>
    </html>
  );
}
