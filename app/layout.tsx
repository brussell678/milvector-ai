import type { Metadata } from "next";
import { Barlow, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { PrimaryNav } from "@/components/primary-nav";

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
  description: "AI career navigation for service members",
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
            Built by Marines for service members. Sign in with your email for free access to transition tools for career planning, documents, benefits, and job search support. If you find them useful, consider donating to help keep the platform free and cover API costs.{" "}
            <Link href="/donate">Donate</Link>
          </p>
        </div>
        <div className="hidden md:block">
          <PrimaryNav />
        </div>
        <div className="fixed right-4 top-32 z-50 md:top-24">
          <ThemeToggle />
        </div>
        <div className="relative z-10 pb-16 pt-16 md:pt-10">{children}</div>
        <footer className="site-footer">
          <p>Copyright 2026 MilVector AI. Built by Russell Innovation Group LLC.</p>
        </footer>
      </body>
    </html>
  );
}
