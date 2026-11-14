// A resume attached to a business card. It is a copy of one file from the
// member's My Files, taken when they pick it.

export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const RESUME_MIMES = [PDF_MIME, DOCX_MIME] as const;
export type ResumeMime = (typeof RESUME_MIMES)[number];

// Files a member can attach: resumes they uploaded or built here.
export const RESUME_DOC_TYPES = ["MASTER_RESUME", "TARGETED_RESUME"] as const;

export const RESUME_MAX_BYTES = 3 * 1024 * 1024;

export const isResumeMime = (mime: string | null | undefined): mime is ResumeMime => (RESUME_MIMES as readonly string[]).includes(mime ?? "");

// The first bytes of the file must match what it claims to be: "%PDF" for a
// PDF, a ZIP header for a Word document.
export function matchesMime(bytes: Uint8Array, mime: ResumeMime): boolean {
  if (bytes.length < 4) return false;
  if (mime === PDF_MIME) return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

// What a visitor's download is called. Built from the name on the card, never
// from the stored filename, which for a targeted resume names the employer it
// was written for.
export function resumeDownloadName(cardName: string, mime: ResumeMime): string {
  const safe = cardName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safe || "Resume"}${safe ? "-Resume" : ""}.${mime === PDF_MIME ? "pdf" : "docx"}`;
}

export type ResumeOption = { id: string; filename: string; kind: "master" | "targeted"; isPdf: boolean; sizeBytes: number; createdAt: string };

type DocRow = { id: string; filename: string; doc_type: string; mime_type: string; size_bytes: number; created_at: string };

// PDFs first, then master resumes before targeted ones, newest first.
export function resumeOptions(rows: DocRow[]): ResumeOption[] {
  return rows
    .filter((row) => isResumeMime(row.mime_type) && row.size_bytes <= RESUME_MAX_BYTES)
    .map((row) => ({
      id: row.id,
      filename: row.filename,
      kind: row.doc_type === "TARGETED_RESUME" ? ("targeted" as const) : ("master" as const),
      isPdf: row.mime_type === PDF_MIME,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
    }))
    .sort(
      (a, b) =>
        Number(b.isPdf) - Number(a.isPdf) || Number(a.kind === "targeted") - Number(b.kind === "targeted") || b.createdAt.localeCompare(a.createdAt),
    );
}
