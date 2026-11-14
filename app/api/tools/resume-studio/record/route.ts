import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { enforceAiUsageLimit } from "@/lib/usage-limit";
import { supabaseServer } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { redactPII } from "@/lib/redact";
import { runLoggedJson } from "@/lib/tools/run";
import { promptRecordConsolidate, promptRecordExtract } from "@/lib/llm/prompts-resume";
import { buildRecord, normalizeExtraction, type BatchDocument, type Extraction } from "@/lib/resume/build";
import { isEvidenceRecord, renderMasterResume } from "@/lib/resume/record";
import { BATCH_CHAR_BUDGET, DOC_CHAR_CAP, RECORD_DOC_TYPES, resumeStudioEnabled } from "@/lib/resume/studio-access";

export const maxDuration = 300;

// Logged under the existing master-resume tool name, so no migration is needed.
const TOOL = "fitrep_bullets";

type DocRow = { id: string; doc_type: string; filename: string; created_at: string; extracted_text: string | null };

async function loadSourceDocs(supabase: Awaited<ReturnType<typeof supabaseServer>>, userId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select("id,doc_type,filename,created_at,extracted_text")
    .eq("user_id", userId)
    .eq("text_extracted", true)
    .not("extracted_text", "is", null)
    .in("doc_type", RECORD_DOC_TYPES)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  // A master resume MilVector generated is output, not a source record.
  return ((data ?? []) as DocRow[]).filter((d) => (d.extracted_text ?? "").trim().length >= 100 && !/^master_resume_\d{4}-\d{2}-\d{2}_/.test(d.filename));
}

/** Lists the member's source documents, grouped into batches that fit one AI call each. */
export async function GET() {
  const { userId, email } = await requireUser();
  if (!resumeStudioEnabled(email)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await supabaseServer();

  const docs = await loadSourceDocs(supabase, userId);
  const batches: { id: string; filename: string; docType: string; chars: number; truncated: boolean }[][] = [];
  let current: (typeof batches)[number] = [];
  let used = 0;
  for (const doc of docs) {
    const length = (doc.extracted_text ?? "").length;
    const chars = Math.min(length, DOC_CHAR_CAP);
    if (current.length > 0 && used + chars > BATCH_CHAR_BUDGET) {
      batches.push(current);
      current = [];
      used = 0;
    }
    current.push({ id: doc.id, filename: doc.filename, docType: doc.doc_type, chars, truncated: length > DOC_CHAR_CAP });
    used += chars;
  }
  if (current.length > 0) batches.push(current);

  const { data: existing } = await supabase
    .from("resume_artifacts")
    .select("id,title,created_at,structured_output")
    .eq("user_id", userId)
    .eq("artifact_type", "master_resume")
    .order("created_at", { ascending: false })
    .limit(10);
  const latest = (existing ?? []).find((row) => isEvidenceRecord(row.structured_output));

  return NextResponse.json({
    documents: docs.length,
    batches,
    latestRecord: latest ? { artifactId: latest.id, title: latest.title, createdAt: latest.created_at, record: latest.structured_output } : null,
  });
}

const ExtractionSchema = z.object({
  roles: z.array(z.object({ key: z.string(), militaryTitle: z.string(), organization: z.string(), start: z.string(), end: z.string() })).max(400),
  accomplishments: z
    .array(
      z.object({
        id: z.string(),
        roleKey: z.string(),
        text: z.string().max(1200),
        source: z.object({ documentId: z.string(), filename: z.string(), docType: z.string() }),
        fromAward: z.boolean(),
        unverifiedNumbers: z.array(z.string()),
      })
    )
    .max(1200),
  credentials: z.array(z.object({ id: z.string(), kind: z.enum(["education", "certification", "training", "clearance"]), text: z.string().max(400) })).max(400),
  questions: z.array(z.string().max(600)).max(100),
});

const InputSchema = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("extract"), documentIds: z.array(z.string().uuid()).min(1).max(40), batchIndex: z.number().int().min(0).max(200) }),
  z.object({
    stage: z.literal("consolidate"),
    extraction: ExtractionSchema,
    documentsRead: z.number().int().min(0),
    documentsAvailable: z.number().int().min(0),
  }),
]);

export async function POST(req: Request) {
  const { userId, email } = await requireUser();
  if (!resumeStudioEnabled(email)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await supabaseServer();

  const parsed = InputSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "That request was not understood. Refresh the page and try again." }, { status: 400 });
  const input = parsed.data;

  const overLimit = await enforceAiUsageLimit({ supabase, userId, email });
  if (overLimit) return overLimit;

  const env = getEnv();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (input.stage === "extract") {
    const { data, error } = await supabase
      .from("documents")
      .select("id,doc_type,filename,created_at,extracted_text")
      .eq("user_id", userId)
      .in("id", input.documentIds)
      .in("doc_type", RECORD_DOC_TYPES);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Keep the order the batch was planned in, so DOC numbers are stable.
    const byId = new Map(((data ?? []) as DocRow[]).map((d) => [d.id, d]));
    const docs: BatchDocument[] = input.documentIds
      .map((id) => byId.get(id))
      .filter((d): d is DocRow => !!d && !!d.extracted_text)
      .map((d) => ({ documentId: d.id, filename: d.filename, docType: d.doc_type, text: redactPII(d.extracted_text ?? "").text.slice(0, DOC_CHAR_CAP) }));
    if (docs.length === 0) return NextResponse.json({ error: "Those documents could not be read." }, { status: 404 });

    const documentsText = docs.map((d, i) => `### DOC ${i + 1} (${d.docType}): ${d.filename}\n${d.text}`).join("\n\n");
    const run = await runLoggedJson<Record<string, unknown>>({
      supabase,
      userId,
      toolName: TOOL,
      inputJson: { mode: "studio_extract", batch: input.batchIndex, documents: docs.length, chars: documentsText.length },
      prompt: promptRecordExtract({ documentsText, branch: profile?.branch }),
      model: env.MASTER_RESUME_MODEL,
      timeoutMs: 180000,
      temperature: 0,
      storeOutput: () => null,
    });
    if (!run.ok) return NextResponse.json({ error: run.error }, { status: 500 });

    const extraction = normalizeExtraction(run.data, docs, `b${input.batchIndex}`);
    return NextResponse.json({ stage: input.stage, extraction, documentsRead: docs.length });
  }

  const extraction = input.extraction as Extraction;
  if (extraction.accomplishments.length === 0) {
    return NextResponse.json({ error: "Nothing usable was found in your records. Upload FITREPs or evaluations first." }, { status: 400 });
  }

  const run = await runLoggedJson<Record<string, unknown>>({
    supabase,
    userId,
    toolName: TOOL,
    inputJson: { mode: "studio_consolidate", roles: extraction.roles.length, accomplishments: extraction.accomplishments.length },
    prompt: promptRecordConsolidate({
      rolesText: extraction.roles.map((r) => `${r.key} | ${r.militaryTitle} | ${r.organization} | ${[r.start, r.end].filter(Boolean).join(" - ")}`).join("\n"),
      accomplishmentsText: extraction.accomplishments.map((a) => `${a.id} | ${a.roleKey} | ${a.text}`).join("\n"),
      credentialsText: extraction.credentials.map((c) => `${c.id} | ${c.kind} | ${c.text}`).join("\n"),
      branch: profile?.branch,
      mos: profile?.mos,
      rank: profile?.rank,
    }),
    model: env.MASTER_RESUME_MODEL,
    timeoutMs: 240000,
    temperature: 0.1,
    storeOutput: () => null,
  });
  if (!run.ok) return NextResponse.json({ error: run.error }, { status: 500 });

  const record = buildRecord({
    consolidated: run.data,
    extraction,
    profile: {
      education: profile?.off_duty_education,
      certifications: profile?.civilian_certifications,
      training: profile?.additional_training,
      clearance: profile?.security_clearance,
    },
    documentsRead: input.documentsRead,
    documentsAvailable: input.documentsAvailable,
    builtAt: new Date().toISOString(),
  });
  if (record.roles.length === 0) {
    return NextResponse.json({ error: "The records did not produce any roles with traceable accomplishments. Try again, or upload clearer copies." }, { status: 422 });
  }

  const { data: saved, error: saveError } = await supabase
    .from("resume_artifacts")
    .insert({
      user_id: userId,
      artifact_type: "master_resume",
      title: `Career record (${record.builtAt.slice(0, 10)})`,
      content: renderMasterResume(record),
      structured_output: record as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });

  return NextResponse.json({ stage: input.stage, artifactId: saved.id, record });
}
