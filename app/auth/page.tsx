import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { PageContainer } from "@/components/layout/page-container";
import { afterSignIn } from "@/lib/safe-next";
import { supabaseServer } from "@/lib/supabase/server";

type Params = { error?: string; mode?: string; next?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<Params> }): Promise<Metadata> {
  const { mode } = await searchParams;
  return { title: mode === "signup" ? "Create your free account" : "Sign in" };
}

export default async function AuthPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  // Where to land once signed in: a path on this site, never back here.
  const next = afterSignIn(params.next);
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && params.mode !== "update-password") redirect(next);

  return (
    <PageContainer className="flex min-h-[calc(100vh-7rem)] items-start pb-12 pt-4 sm:pt-6 md:pt-8" size="md">
      <AuthForm initialError={params.error} initialMode={params.mode} next={next} />
    </PageContainer>
  );
}
