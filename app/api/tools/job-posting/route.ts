import { NextResponse } from "next/server";
import { z } from "zod";
import { authReplies, requireUser } from "@/lib/auth";
import { readJobPosting } from "@/lib/jobs/fetch-posting";

// Reads a job posting from a link for the JD Decoder and the Targeted Resume
// Builder, so a member on a phone pastes one link instead of a whole posting.
// Signed-in members only, so it is not an open proxy. No AI here, so it does
// not count toward the daily limit; the tool run that follows does.
export const maxDuration = 30;

const Input = z.object({ url: z.string().trim().min(4).max(2000) });

async function handlePOST(req: Request) {
  await requireUser();
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste the link to the job posting." }, { status: 400 });

  const result = await readJobPosting(parsed.data.url);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 422 });
  return NextResponse.json({ ...result.posting, url: result.url });
}

export const POST = authReplies(handlePOST);
