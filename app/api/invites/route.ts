import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { INVITE_MIGRATION_MESSAGE, inviteBuilderEnabled, MAX_INVITES_PER_USER } from "@/lib/invites/access";
import { piiProblem } from "@/lib/invites/opsec";
import { InviteDataSchema, splitPrivate, suggestedSlug } from "@/lib/invites/schema";
import { OWNER_COLUMNS, presentInvite, type OwnerRow } from "@/lib/invites/store";
import { isMissingSchema } from "@/lib/cards/store";
import { supabaseServer } from "@/lib/supabase/server";

async function signedIn() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in to continue." }, { status: 401 }) } as const;
  if (!inviteBuilderEnabled(user.email)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { supabase, user } as const;
}

const schemaError = (error: { code?: string; message?: string }) =>
  NextResponse.json({ error: isMissingSchema(error) ? INVITE_MIGRATION_MESSAGE : error.message }, { status: isMissingSchema(error) ? 503 : 500 });

// The member's invitation (or null) and starting values from their profile.
export async function GET() {
  const auth = await signedIn();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const { data, error } = await supabase.from("retirement_invites").select(OWNER_COLUMNS).eq("user_id", user.id).order("created_at").limit(1);
  if (error) return schemaError(error);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,rank,branch,retirement_ceremony_date,professional_email")
    .eq("id", user.id)
    .maybeSingle<{ full_name: string | null; rank: string | null; branch: string | null; retirement_ceremony_date: string | null; professional_email: string | null }>();
  const metaName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").trim();

  const row = (data ?? [])[0] as OwnerRow | undefined;
  return NextResponse.json({
    invite: row ? presentInvite(row) : null,
    defaults: {
      name: profile?.full_name?.trim() || metaName,
      rank: profile?.rank ?? "",
      branch: profile?.branch ?? "USMC",
      ceremonyDate: profile?.retirement_ceremony_date ?? "",
      email: profile?.professional_email ?? user.email ?? "",
    },
  });
}

// Creates the member's invitation as a draft. Nothing is public until published.
export async function POST(req: Request) {
  const auth = await signedIn();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const body = (await req.json().catch(() => null)) as { invite?: unknown } | null;
  const parsed = InviteDataSchema.safeParse(body?.invite);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Check the details and try again.", field: issue?.path.join(".") }, { status: 400 });
  }
  const pii = piiProblem(parsed.data);
  if (pii) return NextResponse.json({ error: pii }, { status: 400 });

  const { count, error: countError } = await supabase.from("retirement_invites").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (countError) return schemaError(countError);
  if ((count ?? 0) >= MAX_INVITES_PER_USER) {
    return NextResponse.json({ error: "You already have an invitation. Refresh the page to open it, or delete it to start over." }, { status: 409 });
  }

  const { publicData, privateData } = splitPrivate(parsed.data);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slug = suggestedSlug(parsed.data.retiree.name, randomBytes(2).toString("hex"));
    const { data, error } = await supabase
      .from("retirement_invites")
      .insert({ user_id: user.id, slug, data: publicData, private_data: privateData, published: false })
      .select(OWNER_COLUMNS)
      .single<OwnerRow>();
    if (!error && data) return NextResponse.json({ invite: presentInvite(data) });
    if (error && error.code !== "23505") return schemaError(error);
  }
  return NextResponse.json({ error: "The invitation could not be created. Try again." }, { status: 500 });
}
