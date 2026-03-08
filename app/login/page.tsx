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
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
      <LoginForm error={params.error} />
    </main>
  );
}
