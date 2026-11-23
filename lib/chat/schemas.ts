import { z } from "zod";
import { CHAT_MESSAGE_CHARS, CHAT_TURN_CHARS, CHAT_TURNS_SENT } from "@/lib/chat/tools";
import { TRANSCRIPT_LIMITS } from "@/lib/chat/transcript";

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
