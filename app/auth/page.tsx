import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { PageContainer } from "@/components/layout/page-container";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && params.mode !== "update-password") redirect("/app");

  return (
    <PageContainer className="flex min-h-[calc(100vh-7rem)] items-start pb-12 pt-4 sm:pt-6 md:pt-8" size="md">
      <AuthForm initialError={params.error} initialMode={params.mode} />
    </PageContainer>
  );
}

