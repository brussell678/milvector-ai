import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { supabaseServer } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/app");

  return (
    <main className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-5xl items-start px-6 pb-12 pt-6 md:px-8 md:pt-8">
      <LoginForm error={params.error} />
    </main>
  );
}