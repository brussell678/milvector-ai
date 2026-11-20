import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listMasterOptions, parseMasterRef, readMasterChoice } from "@/lib/resume-source";
import { supabaseServer } from "@/lib/supabase/server";

// The member's master resume: what they can choose from, and their choice.
export async function GET() {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();
  const choice = await readMasterChoice(supabase, userId);
  return NextResponse.json(
    { canSave: choice.canSave, chosen: choice.ref, options: choice.options },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// The member chooses their master resume: { ref: "document:<id>" | "artifact:<id>" }.
export async function PUT(req: Request) {
  const { userId } = await requireUser();
  const supabase = await supabaseServer();

  const body = (await req.json().catch(() => null)) as { ref?: unknown } | null;
  const parsed = parseMasterRef(body?.ref);
  if (!parsed) return NextResponse.json({ error: "Choose one of your resumes." }, { status: 400 });

  const ref = `${parsed.kind}:${parsed.id}`;
  const option = (await listMasterOptions(supabase, userId)).find((item) => item.ref === ref);
  if (!option) return NextResponse.json({ error: "That resume could not be found. Refresh the page and try again." }, { status: 404 });
  if (!option.ready) return NextResponse.json({ error: "That file is not ready to use yet. Check it in My Files." }, { status: 409 });

  const { data, error } = await supabase.from("profiles").update({ master_resume_ref: ref }).eq("id", userId).select("id").maybeSingle();
  if (error) {
    const notReady = /master_resume_ref|does not exist|schema cache/i.test(error.message ?? "");
    return NextResponse.json(
      { error: notReady ? "Choosing a master resume is not set up on this site yet." : "That did not save. Try again." },
      { status: notReady ? 503 : 500 },
    );
  }
  if (!data) return NextResponse.json({ error: "Finish setting up your profile first." }, { status: 409 });
  return NextResponse.json({ chosen: ref, option });
}
