import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyAdminNewTicket } from "@/lib/email";

// Storage path shape produced by the browser: "<uuid>/<safeName>".
// Anchored + no slashes in the name to prevent traversal / reading other objects.
const ATTACHMENT_PATH_RE = /^[0-9a-fA-F-]{36}\/[\w.\- ]{1,200}$/;

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
    const attachmentPath = form.get("attachment_path")?.toString() || null;
    const attachmentName = form.get("attachment_name")?.toString() || null;
    const attachmentType = form.get("attachment_type")?.toString() || null;
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

    if (attachmentPath) {
      // The browser already uploaded the file straight to Storage; we only get
      // the path. Validate it so a caller can't point us at arbitrary objects.
      if (!ATTACHMENT_PATH_RE.test(attachmentPath)) {
        return NextResponse.json({ error: "Invalid attachment reference." }, { status: 400 });
      }
      attachmentUrl = attachmentPath;
    }

    const { data: inserted, error } = await supabase
      .from("feedback")
      .insert({
        user_id: user?.id ?? null,
        ...parsed.data,
        attachment_url: attachmentUrl,
      })
      .select("id, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Best-effort: pull the attachment back down (service role, private bucket)
    // so it can ride along in the admin email. If the key isn't configured, we
    // still email the ticket and note that the image lives in the admin portal.
    let emailAttachment: { filename: string; base64: string; contentType?: string } | null = null;
    if (attachmentUrl && attachmentName) {
      try {
        const admin = supabaseAdmin();
        if (admin) {
          const { data: blob } = await admin.storage.from("feedback-attachments").download(attachmentUrl);
          if (blob) {
            const buffer = Buffer.from(await blob.arrayBuffer());
            emailAttachment = {
              filename: attachmentName,
              base64: buffer.toString("base64"),
              contentType: attachmentType ?? undefined,
            };
          }
        }
      } catch (err) {
        console.error("Attachment fetch for email failed", err);
      }
    }

    // Fire-and-forget — don't block the response if email fails
    void notifyAdminNewTicket({
      id: inserted?.id ?? crypto.randomUUID(),
      createdAt: inserted?.created_at ?? null,
      name: parsed.data.name ?? null,
      email: parsed.data.email ?? null,
      branch: parsed.data.branch ?? null,
      mos: parsed.data.mos ?? null,
      feedback_type: parsed.data.feedback_type,
      message: parsed.data.message,
      suggested_tool: parsed.data.suggested_tool ?? null,
      attachment: emailAttachment,
      attachmentFilename: attachmentName,
    }).catch((err) => console.error("Admin notify failed", err));

    return NextResponse.json({ ok: true });
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
