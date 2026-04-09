import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

const MAX_MB = Number(process.env.MAX_UPLOAD_MB ?? "10");

const FeedbackSchema = z.object({
  name: z.string().max(120).optional().nullable(),
  email: z.string().email().optional().nullable(),
  branch: z.string().max(80).optional().nullable(),
  mos: z.string().max(80).optional().nullable(),
  feedback_type: z.enum(["bug", "suggestion", "general", "tool_request"]),
  message: z.string().min(10).max(4000),
  suggested_tool: z.string().max(200).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const form = await req.formData();
    const attachment = form.get("attachment");
    const parsed = FeedbackSchema.safeParse({
      name: form.get("name")?.toString() || null,
      email: form.get("email")?.toString() || null,
      branch: form.get("branch")?.toString() || null,
      mos: form.get("mos")?.toString() || null,
      feedback_type: form.get("feedback_type")?.toString(),
      message: form.get("message")?.toString(),
      suggested_tool: form.get("suggested_tool")?.toString() || null,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Please review your feedback form and try again." }, { status: 400 });
    }

    let attachmentUrl: string | null = null;

    if (attachment instanceof File && attachment.size > 0) {
      const sizeMb = attachment.size / (1024 * 1024);
      if (sizeMb > MAX_MB) {
        return NextResponse.json({ error: `Attachment too large (max ${MAX_MB}MB)` }, { status: 400 });
      }

      const safeName = attachment.name.replace(/[^\w.\- ]+/g, "_");
      const feedbackId = crypto.randomUUID();
      const storagePath = `${feedbackId}/${safeName}`;
      const buffer = Buffer.from(await attachment.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("feedback-attachments")
        .upload(storagePath, buffer, {
          contentType: attachment.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      attachmentUrl = storagePath;
    }

    const { data, error } = await supabase
      .from("feedback")
      .insert({
        user_id: user?.id ?? null,
        ...parsed.data,
        attachment_url: attachmentUrl,
      })
      .select("id, status")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, feedback: data });
  } catch (error) {
    console.error("Feedback POST failed", error);
    return NextResponse.json({ error: "Feedback submission failed." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { userId } = await requireUser();
    const supabase = await supabaseServer();

    const { data, error } = await supabase
      .from("feedback")
      .select("id,created_at,feedback_type,message,suggested_tool,status,admin_response,admin_response_updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ feedback: data ?? [] });
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: error.status === 401 ? "Unauthorized" : "Unable to load feedback." }, { status: error.status });
    }
    console.error("Feedback GET failed", error);
    return NextResponse.json({ error: "Unable to load feedback." }, { status: 500 });
  }
}
