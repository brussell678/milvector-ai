import { z } from "zod";

export const DocumentExtractSchema = z.object({
  id: z.string().uuid(),
});

export const FitrepBulletsSchema = z.object({
  documentId: z.string().uuid().optional(),
  pastedText: z.string().min(50).optional(),
  targetRole: z.string().optional().nullable(),
});

export const UploadMetaSchema = z.object({
  doc_type: z.enum(["FITREP", "EVAL", "OTHER"]).default("FITREP"),
});