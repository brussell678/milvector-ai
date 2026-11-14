import { isAdminEmail } from "@/lib/auth";

// Resume Studio is the evidence-based replacement for the Master and Targeted
// Resume Builders. It runs beside them as a preview until it is approved.
// Set RESUME_STUDIO_PUBLIC=true to open it to every signed-in member.
export function resumeStudioEnabled(email?: string | null) {
  return process.env.RESUME_STUDIO_PUBLIC === "true" || isAdminEmail(email);
}

// Source documents read into the record, a batch at a time.
export const RECORD_DOC_TYPES = ["FITREP", "EVAL", "AWARD", "JST", "VMET", "MASTER_RESUME"];
export const BATCH_CHAR_BUDGET = 45000;
export const DOC_CHAR_CAP = 45000;
