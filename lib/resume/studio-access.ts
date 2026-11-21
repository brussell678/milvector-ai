// The document batch reader from the retired Resume Studio (lib/resume/build.ts
// buildRecord and the record prompts) is kept for a later decision on the
// Master Resume Builder. These are its settings: which uploaded records it
// reads, and how much text goes into one request.
export const RECORD_DOC_TYPES = ["FITREP", "EVAL", "AWARD", "JST", "VMET", "MASTER_RESUME"];
export const BATCH_CHAR_BUDGET = 45000;
export const DOC_CHAR_CAP = 45000;
