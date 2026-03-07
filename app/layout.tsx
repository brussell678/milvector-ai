import type { Metadata } from "next";
import { Barlow, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

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
  title: "The Next Mission",
  description: "Guided military transition platform",
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
            Built by Marines to help service members transition, please donate to keep it free for everyone. It
            will hopefully cover API fees.{" "}
            <Link href="https://russell-innovation-group.com/" target="_blank" rel="noopener noreferrer">
              Donate
            </Link>
          </p>
        </div>
        <div className="fixed right-4 top-16 z-50">
          <ThemeToggle />
        </div>
        <div className="relative z-10 pb-16 pt-16">{children}</div>
        <footer className="site-footer">
          <Link href="https://russell-innovation-group.com/" target="_blank" rel="noopener noreferrer">
            © 2026 Russell Innovation Group LLC
          </Link>
        </footer>
      </body>
    </html>
  );
}
