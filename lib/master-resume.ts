// The member's master resume: what they can choose from, and how a choice is
// written down. No database or server code here, so pages can use it too.
//
// Every resume tool works from one master resume, and the member chooses
// which: usually the version they downloaded, refined in Word, and uploaded,
// sometimes a draft MilVector wrote. MilVector never picks for them. The
// choice lives on the profile (migration 0037) as "document:<id>" or
// "artifact:<id>".

export type MasterOrigin = "uploaded" | "milvector";

export type MasterOption = {
  ref: string;
  kind: "document" | "artifact";
  id: string;
  name: string;
  origin: MasterOrigin;
  createdAt: string;
  // False while an upload is still being read; it cannot be used until then.
  ready: boolean;
};

type ArtifactRow = { id: string; title: string; created_at: string };
type DocumentRow = { id: string; filename: string; created_at: string; text_extracted: boolean };

// The Master Resume Builder saves each draft twice: as a saved resume and as
// a file named after it, master_resume_<date>_<first 8 of its id>.txt.
const GENERATED_FILE = /^master_resume_\d{4}-\d{2}-\d{2}_([0-9a-f]{8})\.txt$/i;
// Resume Studio's career records are saved as master resumes too, but they
// are a rebuild from raw records, not a master the member would pick.
const STUDIO_RECORD = /^Career record \(/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the member can choose from, newest first, each draft listed once. */
export function masterOptions(artifacts: ArtifactRow[], documents: DocumentRow[]): MasterOption[] {
  const drafts = artifacts.filter((artifact) => !STUDIO_RECORD.test(artifact.title));
  const draftPrefixes = new Set(drafts.map((artifact) => artifact.id.slice(0, 8).toLowerCase()));
  const options: MasterOption[] = [
    ...drafts.map((artifact) => ({
      ref: `artifact:${artifact.id}`,
      kind: "artifact" as const,
      id: artifact.id,
      name: artifact.title,
      origin: "milvector" as const,
      createdAt: artifact.created_at,
      ready: true,
    })),
    ...documents
      .filter((doc) => {
        const copy = GENERATED_FILE.exec(doc.filename);
        return !(copy && draftPrefixes.has(copy[1].toLowerCase()));
      })
      .map((doc) => ({
        ref: `document:${doc.id}`,
        kind: "document" as const,
        id: doc.id,
        name: doc.filename,
        origin: (GENERATED_FILE.test(doc.filename) ? "milvector" : "uploaded") as MasterOrigin,
        createdAt: doc.created_at,
        ready: !!doc.text_extracted,
      })),
  ];
  return options.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * The choice that a file in My Files stands for: itself, or, for the file
 * copy of a MilVector draft, the draft it was saved from.
 */
export function optionForDocument(options: MasterOption[], doc: { id: string; filename: string }): MasterOption | null {
  const own = options.find((option) => option.kind === "document" && option.id === doc.id);
  if (own) return own;
  const copy = GENERATED_FILE.exec(doc.filename);
  if (!copy) return null;
  return options.find((option) => option.kind === "artifact" && option.id.toLowerCase().startsWith(copy[1].toLowerCase())) ?? null;
}

/** A stored or submitted choice, checked for shape. */
export function parseMasterRef(ref: unknown): { kind: "document" | "artifact"; id: string } | null {
  if (typeof ref !== "string") return null;
  const match = /^(document|artifact):(.+)$/.exec(ref);
  if (!match || !UUID.test(match[2])) return null;
  return { kind: match[1] as "document" | "artifact", id: match[2].toLowerCase() };
}
