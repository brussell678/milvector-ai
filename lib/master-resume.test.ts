import { describe, expect, it } from "vitest";
import { masterOptions, optionForDocument, parseMasterRef } from "@/lib/master-resume";

const DRAFT_ID = "1a2b3c4d-0000-4000-8000-000000000001";
const OLD_DRAFT_ID = "9f9f9f9f-0000-4000-8000-000000000002";
const STUDIO_ID = "5e5e5e5e-0000-4000-8000-000000000003";
const UPLOAD_ID = "2b2b2b2b-0000-4000-8000-000000000004";
const READING_ID = "3c3c3c3c-0000-4000-8000-000000000005";
const ORPHAN_COPY_ID = "4d4d4d4d-0000-4000-8000-000000000006";
const DRAFT_COPY_ID = "6f6f6f6f-0000-4000-8000-000000000007";

const artifacts = [
  { id: DRAFT_ID, title: "Master resume (2026-10-01)", created_at: "2026-10-01T10:00:00Z" },
  { id: OLD_DRAFT_ID, title: "Master resume (2026-08-01)", created_at: "2026-08-01T10:00:00Z" },
  { id: STUDIO_ID, title: "Career record (2026-11-14)", created_at: "2026-11-14T10:00:00Z" },
];
const documents = [
  // The file copy the Master Resume Builder saves beside each draft
  { id: DRAFT_COPY_ID, filename: `master_resume_2026-10-01_${DRAFT_ID.slice(0, 8)}.txt`, created_at: "2026-10-01T10:00:01Z", text_extracted: true },
  // The member's refined version, uploaded later
  { id: UPLOAD_ID, filename: "Russell_Master_Resume.docx", created_at: "2026-10-15T14:16:00Z", text_extracted: true },
  // An upload still being read
  { id: READING_ID, filename: "Newer refinement.docx", created_at: "2026-11-01T09:00:00Z", text_extracted: false },
  // A draft copy whose saved draft was deleted
  { id: ORPHAN_COPY_ID, filename: "master_resume_2026-06-01_deadbeef.txt", created_at: "2026-06-01T10:00:00Z", text_extracted: true },
];

describe("what a member can choose as their master resume", () => {
  const options = masterOptions(artifacts, documents);

  it("lists each MilVector draft once, not once as a draft and again as its file copy", () => {
    expect(options.filter((o) => o.ref === `artifact:${DRAFT_ID}`)).toHaveLength(1);
    expect(options.some((o) => o.ref === `document:${DRAFT_COPY_ID}`)).toBe(false);
  });

  it("does not offer Resume Studio's career records", () => {
    expect(options.some((o) => o.id === STUDIO_ID)).toBe(false);
  });

  it("says where each came from", () => {
    expect(options.find((o) => o.id === UPLOAD_ID)?.origin).toBe("uploaded");
    expect(options.find((o) => o.id === DRAFT_ID)?.origin).toBe("milvector");
    // A draft's file copy whose draft is gone still reads as MilVector's.
    expect(options.find((o) => o.id === ORPHAN_COPY_ID)?.origin).toBe("milvector");
  });

  it("marks an upload still being read as not ready", () => {
    expect(options.find((o) => o.id === READING_ID)?.ready).toBe(false);
    expect(options.find((o) => o.id === UPLOAD_ID)?.ready).toBe(true);
  });

  it("lists newest first, without choosing for the member", () => {
    expect(options.map((o) => o.id)).toEqual([READING_ID, UPLOAD_ID, DRAFT_ID, OLD_DRAFT_ID, ORPHAN_COPY_ID]);
  });

  it("maps a file in My Files to the choice it stands for", () => {
    expect(optionForDocument(options, { id: UPLOAD_ID, filename: "Russell_Master_Resume.docx" })?.ref).toBe(`document:${UPLOAD_ID}`);
    expect(optionForDocument(options, documents[0])?.ref).toBe(`artifact:${DRAFT_ID}`);
    expect(optionForDocument(options, { id: "7a7a7a7a-0000-4000-8000-000000000008", filename: "other.docx" })).toBeNull();
  });
});

describe("a stored choice", () => {
  it("accepts a document or a saved resume by id", () => {
    expect(parseMasterRef(`document:${UPLOAD_ID}`)).toEqual({ kind: "document", id: UPLOAD_ID });
    expect(parseMasterRef(`artifact:${DRAFT_ID.toUpperCase()}`)).toEqual({ kind: "artifact", id: DRAFT_ID });
  });

  it("refuses anything else", () => {
    for (const bad of [null, "", "document:", "document:not-a-uuid", `file:${UPLOAD_ID}`, `document:${UPLOAD_ID};drop`, 42]) {
      expect(parseMasterRef(bad)).toBeNull();
    }
  });
});
