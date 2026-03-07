import { z } from "zod";

export const DocumentExtractSchema = z.object({
  id: z.string().uuid(),
});

export const FitrepBulletsSchema = z.object({
  mode: z.enum(["bullets", "master_resume"]).optional().default("bullets"),
  documentId: z.string().uuid().optional(),
  pastedText: z.string().min(50).optional(),
  vmetText: z.string().min(100).max(40000).optional(),
  jstText: z.string().min(50).max(40000).optional(),
  fitrepsText: z.string().min(150).max(120000).optional(),
  targetRole: z.string().optional().nullable(),
});

export const UploadMetaSchema = z.object({
  doc_type: z.enum(["FITREP", "EVAL", "VMET", "JST", "MASTER_RESUME", "RESUME_TEMPLATE", "OTHER"]).default("FITREP"),
});
