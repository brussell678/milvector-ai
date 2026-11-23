import { z } from "zod";
import { CHAT_MESSAGE_CHARS, CHAT_TURN_CHARS, CHAT_TURNS_SENT } from "@/lib/chat/tools";
import { TRANSCRIPT_LIMITS } from "@/lib/chat/transcript";
import { POSTING_CONTEXT_CHARS } from "@/lib/chat/jd";

// What the chat endpoints accept. Everything here comes from the member's own
// page, so it is checked and capped before it reaches the model or a file.

const text = (max: number) => z.coerce.string().transform((s) => s.slice(0, max));

// The last few turns of the conversation; longer ones are cut, not refused.
export const FollowUpSchema = z.object({
  message: z.string().trim().min(1).max(CHAT_MESSAGE_CHARS),
  turns: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: text(CHAT_TURN_CHARS) }))
    .max(60)
    .default([])
    .transform((turns) => turns.filter((t) => t.content.trim()).slice(-CHAT_TURNS_SENT)),
  context: z.unknown(),
});

export const MosContextSchema = z.object({
  inputs: z.object({
    mos: text(40).default(""),
    billets: z.array(text(120)).max(20).default([]),
    yearsExp: z.number().int().min(0).max(60).nullable().default(null),
    interests: z.array(text(120)).max(20).default([]),
  }),
  result: z
    .object({
      civilian_roles: z
        .array(
          z.object({
            title: text(160),
            match_strength: text(40).optional(),
            why_fit: text(1200).default(""),
            common_industries: z.array(text(80)).max(8).default([]),
            keywords: z.array(text(80)).max(12).default([]),
          }),
        )
        .max(8),
      recommended_certs: z.array(z.object({ name: text(160), why: text(800).default(""), time_to_get: text(80).default("") })).max(8).default([]),
    })
    .nullable()
    .default(null),
});

const textList = (items: number, chars: number) => z.array(text(chars)).max(items).default([]);

export const JdContextSchema = z.object({
  // Both null before any decode.
  posting: z
    .object({
      title: text(200).nullable().default(null),
      company: text(200).nullable().default(null),
      text: text(POSTING_CONTEXT_CHARS),
    })
    .nullable()
    .default(null),
  decode: z.object({
    job_title: text(200).optional(),
    plain_english_summary: text(2000).default(""),
    role_mission_summary: text(2000).default(""),
    role_level_guess: text(40).default(""),
    role_level_confidence: text(20).optional(),
    hard_requirements: textList(30, 400),
    soft_requirements: textList(30, 400),
    implied_expectations: textList(30, 400),
    top_must_have_signals: textList(20, 400),
    ats_keywords_priority: textList(40, 80),
    company_context_signals: textList(20, 400),
    fit_risks: textList(20, 400),
    clarifying_questions: textList(20, 400),
    interview_focus_areas: textList(20, 400),
    likely_interview_questions: textList(30, 400),
  }).nullable().default(null),
  fit: z
    .object({
      recommendation: text(20),
      reason: text(1000).default(""),
      requirements: z
        .array(z.object({ requirement: text(400), type: text(20), assessment: text(20), evidence: textList(8, 600), bridge: text(800).default("") }))
        .max(40),
    })
    .nullable()
    .default(null),
  fitNote: text(400).nullable().default(null),
});

export const TranscriptRequestSchema = z.object({
  mode: z.enum(["download", "save"]),
  title: z.string().trim().min(2).max(120),
  inputs: z.string().max(1000).default(""),
  blocks: z
    .array(
      z.object({
        speaker: z.enum(["you", "milvector"]),
        heading: z.string().max(300).optional(),
        lines: z.array(z.object({ kind: z.enum(["para", "bullet", "label"]), text: z.string().max(TRANSCRIPT_LIMITS.chars) })).max(TRANSCRIPT_LIMITS.lines),
      }),
    )
    .min(1)
    .max(TRANSCRIPT_LIMITS.blocks),
});
