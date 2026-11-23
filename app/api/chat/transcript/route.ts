import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { authReplies, requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { redactPII } from "@/lib/redact";
import { chatEnabled } from "@/lib/chat/access";
import { TranscriptRequestSchema } from "@/lib/chat/schemas";
import { tidyChatText } from "@/lib/chat/text";
import { chatToolFor } from "@/lib/chat/tools";
import { TRANSCRIPT_LIMITS, transcriptFilename, transcriptText, type Transcript } from "@/lib/chat/transcript";
import { renderTranscriptDocx } from "@/lib/chat/transcript-docx";

// A chat as a Word file (docs/CHAT_TOOLS_PLAN.md, 1.6). Download renders it
// and keeps nothing. Save stores the same file in My Files as a Saved chat
// (doc type CHAT_TRANSCRIPT, migration 0043). SSN and DoD ID numbers are
// scrubbed from every line first, as they are from anything else stored.

export const maxDuration = 60;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SAVE_NOT_READY = "Saving chats to My Files is not switched on yet. Download it instead; nothing is lost.";

async function handlePOST(req: Request) {
  const { userId, email } = await requireUser();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const info = chatToolFor(String(body?.tool ?? ""));
  if (!info || !chatEnabled(info.key, email)) return NextResponse.json({ error: "This chat is not open yet." }, { status: 404 });

  const parsed = TranscriptRequestSchema.safeParse(body);
  const total = parsed.success ? parsed.data.blocks.reduce((n, b) => n + b.lines.reduce((m, l) => m + l.text.length, 0), 0) : 0;
  if (!parsed.success || total > TRANSCRIPT_LIMITS.total) {
    return NextResponse.json({ error: "This chat could not be written out. Start a new chat if it is very long." }, { status: 400 });
  }

  const scrub = (value: string) => redactPII(tidyChatText(value)).text.trim();
  const transcript: Transcript = {
    title: scrub(parsed.data.title),
    inputs: scrub(parsed.data.inputs),
    blocks: parsed.data.blocks.map((block) => ({
      speaker: block.speaker,
      heading: block.heading ? scrub(block.heading) : undefined,
      lines: block.lines.map((line) => ({ kind: line.kind, text: scrub(line.text) })).filter((line) => line.text),
    })),
  };
  // The member's own date, so a chat saved late in the evening carries today.
  const savedOn = typeof body?.savedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.savedOn) ? body.savedOn : new Date().toISOString().slice(0, 10);
  const buffer = await renderTranscriptDocx(transcript, savedOn);
  const filename = transcriptFilename(transcript.title, savedOn);

  if (parsed.data.mode === "download") {
    return new Response(new Uint8Array(buffer), {
      headers: { "Content-Type": DOCX, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
    });
  }

  const supabase = await supabaseServer();
  const documentId = crypto.randomUUID();
  const storagePath = `${userId}/${documentId}/${filename}`;
  const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, buffer, { contentType: DOCX, upsert: false });
  if (uploadError) return NextResponse.json({ error: "Your chat could not be saved. Try again, or download it instead." }, { status: 500 });
  const { error: docError } = await supabase.from("documents").insert({
    id: documentId,
    user_id: userId,
    doc_type: "CHAT_TRANSCRIPT",
    filename,
    storage_path: storagePath,
    mime_type: DOCX,
    size_bytes: buffer.byteLength,
    text_extracted: true,
    extracted_text: transcriptText(transcript, savedOn),
  });
  if (docError) {
    await supabase.storage.from("documents").remove([storagePath]);
    // 23514: the file type check, before migration 0043 is run.
    const notReady = docError.code === "23514" || /doc_type_check/.test(docError.message);
    return NextResponse.json(notReady ? { error: SAVE_NOT_READY, code: "not_ready" } : { error: "Your chat could not be saved. Try again, or download it instead." }, { status: notReady ? 409 : 500 });
  }
  return NextResponse.json({ documentId, fileName: filename });
}

export const POST = authReplies(handlePOST);
