import { qrColor, textOnColor } from "@/lib/cards/schema";

// The looks a member can pick for their retirement invitation. MilVector
// designs these; the member chooses one and an accent color. Every template
// has to stay readable on a phone with any accent, so the colors a guest reads
// are checked for contrast below rather than trusted.

export const TEMPLATE_IDS = ["dress-blues", "formal", "field"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type Template = {
  id: TemplateId;
  name: string;
  description: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  defaultAccent: string;
  // Heading typeface family, resolved in components/invites/fonts.ts
  heading: "display" | "serif" | "condensed";
  dark: boolean;
};

export const TEMPLATES: Record<TemplateId, Template> = {
  "dress-blues": {
    id: "dress-blues",
    name: "Dress Blues",
    description: "Dark navy with brass. Formal and quiet.",
    bg: "#0a1522",
    surface: "#122236",
    ink: "#f3efe4",
    muted: "#b6c0cb",
    line: "#26384d",
    defaultAccent: "#d9b45f",
    heading: "display",
    dark: true,
  },
  formal: {
    id: "formal",
    name: "Formal",
    description: "Ivory and navy with a classic serif. Like engraved stationery.",
    bg: "#faf8f3",
    surface: "#ffffff",
    ink: "#1b2430",
    muted: "#59626e",
    line: "#e3ded2",
    defaultAccent: "#1d3557",
    heading: "serif",
    dark: false,
  },
  field: {
    id: "field",
    name: "Field",
    description: "Olive and sand. Relaxed, outdoors, a cookout after.",
    bg: "#f0ebdf",
    surface: "#faf7f0",
    ink: "#232a1d",
    muted: "#5c6350",
    line: "#d8d0bc",
    defaultAccent: "#4b5320",
    heading: "condensed",
    dark: false,
  },
};

// Accent presets. Colors in the spirit of each service, not official marks.
export const ACCENT_PRESETS: { hex: string; label: string }[] = [
  { hex: "#d9b45f", label: "Brass" },
  { hex: "#a6192e", label: "Scarlet" },
  { hex: "#f2b705", label: "Gold" },
  { hex: "#1d3557", label: "Navy" },
  { hex: "#1f4fa3", label: "Ultramarine" },
  { hex: "#c8102e", label: "Red" },
  { hex: "#4b5320", label: "Olive" },
  { hex: "#3f4a5a", label: "Slate" },
];

export function readTemplate(id: string | null | undefined): Template {
  return TEMPLATES[(TEMPLATE_IDS as readonly string[]).includes(id ?? "") ? (id as TemplateId) : "dress-blues"];
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type InviteColors = {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  // Button fill and the text that sits on it
  accent: string;
  onAccent: string;
  // The accent when it is readable as text on the page, otherwise the ink color
  accentText: string;
  // A dark color for QR codes printed on white
  qr: string;
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function inviteColors(template: Template, accent: string | null | undefined): InviteColors {
  const chosen = accent && HEX_RE.test(accent) ? accent.toLowerCase() : template.defaultAccent;
  return {
    bg: template.bg,
    surface: template.surface,
    ink: template.ink,
    muted: template.muted,
    line: template.line,
    accent: chosen,
    onAccent: textOnColor(chosen),
    accentText: contrastRatio(chosen, template.bg) >= 4.5 ? chosen : template.ink,
    qr: qrColor(chosen),
  };
}
