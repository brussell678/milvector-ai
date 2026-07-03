import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { WelcomeFlow } from "@/components/welcome/welcome-flow";

export default async function WelcomePage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");
  if (user.user_metadata?.onboarded) redirect("/app");

  return <WelcomeFlow />;
}
