import { Barlow_Condensed, Cormorant_Garamond } from "next/font/google";
import type { Template } from "@/lib/invites/templates";

// Heading typefaces for the invitation templates. Loaded only on pages that
// show an invitation; body text stays in the site's Barlow.

const serif = Cormorant_Garamond({ variable: "--font-iv-serif", subsets: ["latin"], weight: ["500", "600", "700"] });
const condensed = Barlow_Condensed({ variable: "--font-iv-condensed", subsets: ["latin"], weight: ["600", "700"] });

export const inviteFontVariables = `${serif.variable} ${condensed.variable}`;

export function headingFamily(heading: Template["heading"]): string {
  if (heading === "serif") return "var(--font-iv-serif), Georgia, 'Times New Roman', serif";
  if (heading === "condensed") return "var(--font-iv-condensed), var(--font-barlow), sans-serif";
  return "var(--font-barlow), sans-serif";
}
