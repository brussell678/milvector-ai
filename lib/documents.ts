import mammoth from "mammoth";
import { extractTextFromPdfBuffer } from "@/lib/pdf";

export const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "txt", "md"] as const;

export function getFileExtension(filename: string) {
  const idx = filename.lastIndexOf(".");
  if (idx < 0) return "";
  return filename.slice(idx + 1).toLowerCase();
}

export function isAllowedDocumentFile(file: File) {
  const ext = getFileExtension(file.name);
  return ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number]);
}

export function guessMimeFromExtension(filename: string, fallback: string) {
  const ext = getFileExtension(filename);
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "doc") return "application/msword";
  if (ext === "txt") return "text/plain";
  if (ext === "md") return "text/markdown";
  return fallback || "application/octet-stream";
}

export async function extractTextFromDocumentBuffer(args: {
  buffer: Buffer;
  filename: string;
  mimeType?: string | null;
}) {
  const ext = getFileExtension(args.filename);

  if (ext === "pdf") {
    return extractTextFromPdfBuffer(args.buffer);
  }

  if (ext === "txt" || ext === "md") {
    return args.buffer.toString("utf-8");
  }

  if (ext === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: args.buffer });
    return value;
  }

  if (ext === "doc") {
    throw new Error("Legacy .doc extraction is not supported. Convert to .docx, .pdf, .txt, or .md.");
  }

  throw new Error(`Unsupported file type: .${ext || "unknown"}`);
}
