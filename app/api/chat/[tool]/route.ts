import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { authReplies, requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { redactPII } from "@/lib/redact";
import { chatEnabled } from "@/lib/chat/access";
import { enforceChatLimit } from "@/lib/chat/limit";
import { MosRunSchema, parseMeta, SbpRunSchema, VaRunSchema } from "@/lib/chat/meta";
import { FollowUpSchema, JdContextSchema, MosContextSchema, ResumeContextSchema, SbpContextSchema, VaContextSchema } from "@/lib/chat/schemas";
import { AnswerSplitter, encodeEvent, type ChatEvent } from "@/lib/chat/stream";
import { chatToolFor, type ChatToolId } from "@/lib/chat/tools";
import { AI_MESSAGES, ChatStreamError, streamChat, type ChatTurn } from "@/lib/llm/client";
import { promptChatSystem, type ChatContext } from "@/lib/llm/prompts-chat";

// Follow-up questions in a chat tool (docs/CHAT_TOOLS_PLAN.md, 1.4). The
// answer streams as it is written; after it come the suggested next questions
// and any proposed run, checked here. Nothing runs from this endpoint: a
// proposed run is a button the member taps. Each answer is logged in tool_runs
// under the tool's name, marked _chat, with no message text kept.

export const maxDuration = 120;

const ANSWER_TIMEOUT_MS = 90_000;
const TOO_SLOW = "That answer took too long. Ask again, or ask a shorter question.";

type Ctx = { params: Promise<{ tool: string }> };

// Per tool: what the page must send as context, and the run the model may
// propose (null: this tool's chat never proposes one).
const SPECS = {
  mos_translator: { context: MosContextSchema, run: MosRunSchema },
  jd_decoder: { context: JdContextSchema, run: null },
  resume_targeter: { context: ResumeContextSchema, run: null },
  va_rating_navigator: { context: VaContextSchema, run: VaRunSchema },
  sbp_advisor: { context: SbpContextSchema, run: SbpRunSchema },
} satisfies Record<ChatToolId, { context: unknown; run: unknown }>;

async function handlePOST(req: Request, ctx: Ctx) {
  const { userId, email } = await requireUser();
  const { tool } = await ctx.params;
  const info = chatToolFor(tool);
  if (!info || !(await chatEnabled(info.key, email))) return NextResponse.json({ error: "This chat is not open yet." }, { status: 404 });

  const spec = SPECS[tool as ChatToolId];
  const parsed = FollowUpSchema.safeParse(await req.json().catch(() => null));
  const context = parsed.success ? spec.context.safeParse(parsed.data.context) : null;
  if (!parsed.success || !context?.success) {
    return NextResponse.json({ error: "That message could not be sent. Refresh the page and try again." }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const overLimit = await enforceChatLimit({ supabase, userId, email, toolName: info.toolName });
  if (overLimit) return overLimit;

  const env = getEnv();
  const model = env.CHAT_MODEL ?? env.TOOLS_MODEL;
  const effort = env.CHAT_EFFORT ?? env.LLM_REASONING_EFFORT;
  // What members type is scrubbed of SSN and DoD ID numbers before the model sees it.
  const turns: ChatTurn[] = [
    ...parsed.data.turns.map((t) => ({ role: t.role, content: t.role === "user" ? redactPII(t.content).text : t.content })),
    { role: "user", content: redactPII(parsed.data.message).text },
  ];
  const system =
    tool === "jd_decoder"
      ? promptChatSystem("jd_decoder", context.data as ChatContext["jd_decoder"])
      : tool === "resume_targeter"
        ? promptChatSystem("resume_targeter", context.data as ChatContext["resume_targeter"])
        : tool === "va_rating_navigator"
          ? promptChatSystem("va_rating_navigator", context.data as ChatContext["va_rating_navigator"])
          : tool === "sbp_advisor"
            ? promptChatSystem("sbp_advisor", context.data as ChatContext["sbp_advisor"])
            : promptChatSystem("mos_translator", context.data as ChatContext["mos_translator"]);

  const upstream = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    upstream.abort();
  }, ANSWER_TIMEOUT_MS);
  const started = Date.now();
  const encoder = new TextEncoder();

  // Besides the size of the turn, the log keeps how many suggestions the model
  // gave and whether it wrote the mark, to see how often it leaves them out.
  const log = async (row: { status: "success" | "error"; tokensIn?: number; tokensOut?: number; error?: string; suggestions?: number; marked?: boolean }) => {
    try {
      await supabase.from("tool_runs").insert({
        user_id: userId,
        tool_name: info.toolName,
        status: row.status,
        input_json: {
          _chat: true,
          _model: model,
          turns: turns.length,
          chars: parsed.data.message.length,
          ...(row.suggestions === undefined ? {} : { suggestions: row.suggestions, marked: !!row.marked }),
        },
        latency_ms: Date.now() - started,
        tokens_in: row.tokensIn ?? null,
        tokens_out: row.tokensOut ?? null,
        ...(row.error ? { error_message: row.error.slice(0, 500) } : {}),
      });
    } catch {
      // A failed log line never costs the member their answer.
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: ChatEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          open = false;
        }
      };
      const splitter = new AnswerSplitter();
      let answered = "";
      let tokensIn: number | undefined;
      let tokensOut: number | undefined;
      try {
        for await (const piece of streamChat({ system, turns, model, reasoningEffort: effort, signal: upstream.signal })) {
          if (piece.type === "usage") {
            tokensIn = piece.tokensIn;
            tokensOut = piece.tokensOut;
            continue;
          }
          const shown = splitter.push(piece.text);
          if (shown) {
            answered += shown;
            send({ type: "delta", text: shown });
          }
        }
        const { rest, meta } = splitter.finish();
        if (rest) {
          answered += rest;
          send({ type: "delta", text: rest });
        }
        if (!answered.trim()) throw new ChatStreamError(AI_MESSAGES.outage, "The model returned no answer text.");
        // Each tool's proposed run is checked by its own schema (or none).
        const { suggestions, run } = parseMeta<unknown>(meta, spec.run as ZodType<unknown> | null);
        await log({ status: "success", tokensIn, tokensOut, suggestions: suggestions.length, marked: meta !== null });
        send({ type: "done", suggestions, run });
      } catch (error) {
        const failure = error instanceof ChatStreamError ? error : new ChatStreamError(AI_MESSAGES.outage, error instanceof Error ? error.message : String(error));
        await log({ status: "error", tokensIn, tokensOut, error: timedOut ? `timed out: ${failure.detail}` : failure.detail });
        send({ type: "error", error: timedOut ? TOO_SLOW : failure.memberMessage });
      } finally {
        clearTimeout(timer);
        if (open) {
          try {
            controller.close();
          } catch {
            // already closed by the reader
          }
        }
      }
    },
    cancel() {
      // The member tapped Stop or left: stop paying for the rest of the answer.
      upstream.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export const POST = authReplies(handlePOST);
