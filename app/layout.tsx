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
            Built by Marines for service members. Sign in with your email for free access to resume tools, and donate
            if you can to help keep it free for everyone and cover API costs.{" "}
            <Link href="https://russell-innovation-group.com/" target="_blank" rel="noopener noreferrer">
              Donate
            </Link>
          </p>
        </div>
        <PrimaryNav />
        <div className="fixed right-4 top-24 z-50">
          <ThemeToggle />
        </div>
        <div className="relative z-10 pb-16 pt-10">{children}</div>
        <footer className="site-footer">
          <Link href="https://russell-innovation-group.com/" target="_blank" rel="noopener noreferrer">
            (c) 2026 Russell Innovation Group LLC
          </Link>
        </footer>
      </body>
    </html>
  );
}
