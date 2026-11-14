// Page-length estimate for the targeted resume.
//
// The DOCX is rendered by lib/resume-template.ts: US Letter, 0.5 inch margins,
// Aptos 11 point. Nothing on the server can open Word and count pages, so the
// length is estimated from how many lines each paragraph wraps to. It is an
// estimate and is labeled as one everywhere it is shown; opening the file in
// Word is the real measurement.
//
// Calibration: at 11 point Aptos averages about 0.092 inch per character on
// resume prose, so a 7.5 inch line holds about 100 characters. Line pitch at
// single spacing is about 13.4 points, and the text area is 720 points tall.

const CHARS_PER_LINE = 100;
const BULLET_CHARS_PER_LINE = 97; // hanging indent
const LINE_PT = 13.4;
const PAGE_PT = 720;

export type LayoutInput = {
  hasTitleLine: boolean;
  contactLines: number;
  summary: string;
  skillsLine: string;
  roles: { bullets: string[] }[];
  educationItems: number;
  educationGroups: number;
};

const wrap = (text: string, perLine: number) => Math.max(1, Math.ceil(text.trim().length / perLine));

export function estimatePoints(input: LayoutInput): number {
  let pt = 0;
  // Name (22pt), optional title line (13pt), contact lines, rule
  pt += 27 + (input.hasTitleLine ? 16 : 0) + input.contactLines * LINE_PT + 8;

  const section = () => 17 + 6; // heading plus rule
  if (input.summary) pt += section() + wrap(input.summary, CHARS_PER_LINE) * LINE_PT + 2;
  if (input.skillsLine) pt += section() + wrap(input.skillsLine, CHARS_PER_LINE) * LINE_PT + 2;

  if (input.roles.length) pt += section();
  for (const role of input.roles) {
    pt += 2 * LINE_PT + 1.5; // title line, organization and dates line
    for (const bullet of role.bullets) pt += wrap(bullet, BULLET_CHARS_PER_LINE) * LINE_PT + 1;
    pt += LINE_PT * 0.6 + 2; // gap after the role
  }

  if (input.educationItems > 0) {
    pt += section() + input.educationGroups * (LINE_PT + 0.5) + input.educationItems * (LINE_PT + 1);
  }
  return pt;
}

export function estimatePages(input: LayoutInput): number {
  return Math.round((estimatePoints(input) / PAGE_PT) * 100) / 100;
}

// A resume should fill what it uses. Two full pages for a long career, one
// for a short one; never a third page and never a page that is mostly empty.
export const MAX_PAGES = 2;
// Leave room for Word wrapping a little differently than the estimate.
export const FIT_TARGET_PAGES = 1.94;
