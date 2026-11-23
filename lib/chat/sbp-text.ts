import type { SbpAssessment } from "@/lib/sbp/inputs";

/** The assessment's alternatives as lines, shared by the page and the Word file. */
export function sbpAlternativesText(r: SbpAssessment): string[] {
  return [
    r.strong_alternative,
    r.if_you_value_flexibility_more ? `If flexibility matters more: ${r.if_you_value_flexibility_more}` : "",
    r.if_you_value_certainty_more ? `If certainty matters more: ${r.if_you_value_certainty_more}` : "",
  ].filter(Boolean);
}
