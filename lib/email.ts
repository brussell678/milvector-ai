import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? "support@milvectorai.com";
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? "brussell678@gmail.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://milvectorai.com";

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug Report",
  suggestion: "Suggestion",
  general: "General",
  tool_request: "Tool Request",
};

function baseHtml(title: string, body: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body { margin:0; padding:0; background:#0d0f12; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#e2e8f0; }
  .wrap { max-width:560px; margin:40px auto; background:#15181e; border:1px solid #2a2f3a; border-radius:12px; overflow:hidden; }
  .hdr { background:linear-gradient(135deg,#1a2230 0%,#0f1825 100%); padding:28px 32px; border-bottom:1px solid #2a2f3a; }
  .hdr-kicker { font-size:10px; font-weight:700; letter-spacing:.1em; color:#39a67f; text-transform:uppercase; margin-bottom:6px; }
  .hdr-title { font-size:18px; font-weight:700; color:#f0f4f8; margin:0; }
  .body { padding:28px 32px; }
  .label { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:#6b7a8d; margin-bottom:4px; }
  .value { font-size:14px; color:#c8d0dc; line-height:1.6; }
  .msg-block { background:#0d0f12; border:1px solid #2a2f3a; border-radius:8px; padding:16px; margin:16px 0; font-size:14px; color:#c8d0dc; line-height:1.6; white-space:pre-wrap; }
  .reply-block { background:#0d1a12; border:1px solid #2a4a35; border-left:3px solid #39a67f; border-radius:8px; padding:16px; margin:16px 0; font-size:14px; color:#c8d0dc; line-height:1.6; white-space:pre-wrap; }
  .btn { display:inline-block; margin-top:20px; padding:10px 20px; background:#39a67f; color:#fff; text-decoration:none; border-radius:8px; font-size:14px; font-weight:600; }
  .ftr { padding:20px 32px; border-top:1px solid #2a2f3a; font-size:12px; color:#4a5568; }
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div class="hdr-kicker">MILVECTOR AI</div>
    <div class="hdr-title">${title}</div>
  </div>
  <div class="body">${body}</div>
  <div class="ftr">MilVector AI &mdash; Military-to-civilian career transition platform. This message was sent automatically.</div>
</div>
</body>
</html>`;
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyAdminNewTicket(ticket: {
  id: string;
  name: string | null;
  email: string | null;
  branch: string | null;
  mos: string | null;
  feedback_type: string;
  message: string;
  suggested_tool: string | null;
  createdAt?: string | null;
  attachment?: { filename: string; base64: string; contentType?: string } | null;
  attachmentFilename?: string | null;
}) {
  if (!process.env.RESEND_API_KEY) return;

  const typeLabel = TYPE_LABELS[ticket.feedback_type] ?? ticket.feedback_type;
  const submitted = ticket.createdAt ? new Date(ticket.createdAt) : new Date();

  // Bytes embedded when available; otherwise point to the admin portal.
  const attachmentLine = ticket.attachment
    ? `${ticket.attachment.filename} (included in this email)`
    : ticket.attachmentFilename
    ? `${ticket.attachmentFilename} (view in admin portal)`
    : "none";

  // Paste-ready block — the owner copies this straight into their dev tool for a quick fix.
  const pasteText = [
    "MILVECTOR SUPPORT TICKET",
    `Type: ${typeLabel}`,
    `Ticket ID: ${ticket.id}`,
    `Submitted: ${submitted.toISOString()}`,
    ticket.name ? `Name: ${ticket.name}` : null,
    ticket.email ? `Email: ${ticket.email}` : null,
    ticket.branch ? `Branch: ${ticket.branch}` : null,
    ticket.mos ? `MOS: ${ticket.mos}` : null,
    ticket.suggested_tool ? `Suggested Tool: ${ticket.suggested_tool}` : null,
    `Attachment: ${attachmentLine}`,
    "",
    "MESSAGE:",
    ticket.message,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const meta = [
    ticket.name && `<b>Name:</b> ${escapeHtml(ticket.name)}`,
    ticket.email && `<b>Email:</b> ${escapeHtml(ticket.email)}`,
    ticket.branch && `<b>Branch:</b> ${escapeHtml(ticket.branch)}`,
    ticket.mos && `<b>MOS:</b> ${escapeHtml(ticket.mos)}`,
    ticket.suggested_tool && `<b>Suggested Tool:</b> ${escapeHtml(ticket.suggested_tool)}`,
  ]
    .filter(Boolean)
    .join(" &bull; ");

  const copyBlockStyle =
    "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;white-space:pre-wrap;" +
    "background:#0d0f12;border:1px solid #2a2f3a;border-radius:8px;padding:14px;color:#c8d0dc;line-height:1.5;margin:8px 0 4px;";

  const body = `
    <p class="label">Ticket Type</p>
    <p class="value">${typeLabel}</p>
    ${meta ? `<p class="value" style="margin-top:8px;font-size:13px;color:#6b7a8d;">${meta}</p>` : ""}
    ${
      ticket.attachment
        ? `<p class="value" style="margin-top:8px;font-size:13px;color:#39a67f;">&#128206; Attachment included: ${escapeHtml(
            ticket.attachment.filename
          )}</p>`
        : ticket.attachmentFilename
        ? `<p class="value" style="margin-top:8px;font-size:13px;color:#6b7a8d;">&#128206; Attachment: ${escapeHtml(
            ticket.attachmentFilename
          )} — view inline in the admin portal</p>`
        : ""
    }
    <p class="label" style="margin-top:16px;">Message</p>
    <div class="msg-block">${escapeHtml(ticket.message)}</div>
    <p class="label" style="margin-top:20px;">Copy for quick remedy</p>
    <div style="${copyBlockStyle}">${escapeHtml(pasteText)}</div>
    <a class="btn" href="${APP_URL}/app/admin">Open Admin Portal</a>
  `;

  const attachments = ticket.attachment
    ? [{ filename: ticket.attachment.filename, content: ticket.attachment.base64 }]
    : undefined;

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `[MilVector Support] New ${typeLabel} — ${ticket.name ?? ticket.email ?? "Anonymous"}`,
    html: baseHtml("New Support Case Received", body),
    text: pasteText,
    attachments,
  });
}

export async function notifyUserAdminResponse(opts: {
  to: string;
  ticketType: string;
  ticketMessage: string;
  adminResponse: string;
}) {
  if (!process.env.RESEND_API_KEY) return;

  const typeLabel = TYPE_LABELS[opts.ticketType] ?? opts.ticketType;

  const body = `
    <p class="value">The MilVector team has responded to your ${typeLabel.toLowerCase()} support case.</p>
    <p class="label" style="margin-top:20px;">Your Original Message</p>
    <div class="msg-block">${opts.ticketMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    <p class="label">MilVector Response</p>
    <div class="reply-block">${opts.adminResponse.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    <a class="btn" href="${APP_URL}/app/support">View Your Support Cases</a>
  `;

  await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: `[MilVector] Response to your ${typeLabel.toLowerCase()} support case`,
    html: baseHtml("Your Support Case Has a Response", body),
  });
}

export async function notifyUserRequestShipped(opts: {
  to: string;
  ticketMessage: string;
  updateTitle: string;
  updateBody: string;
}) {
  if (!process.env.RESEND_API_KEY) return;

  const body = `
    <p class="value">You reported something, and it's now live on MilVector. Thanks for helping make the platform better for everyone transitioning.</p>
    <p class="label" style="margin-top:20px;">What You Told Us</p>
    <div class="msg-block">${opts.ticketMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    <p class="label">What Shipped</p>
    <div class="reply-block"><b>${opts.updateTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</b><br/>${opts.updateBody
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</div>
    <a class="btn" href="${APP_URL}/app/whats-new">See What's New</a>
  `;

  await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: "[MilVector] You asked, we built it — your request is live",
    html: baseHtml("Your Request Is Live", body),
  });
}
