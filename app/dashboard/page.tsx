import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";
import { createClient } from "@/lib/supabase";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  if (!accessToken) {
    redirect("/login?next=/dashboard");
  }
  const supabase = createClient({ accessToken });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  let profile: { username: string | null; full_name: string | null } | null = null;

  const byId = await supabase
    .from("profiles")
    .select("username, full_name")
    .eq("id", user.id)
    .maybeSingle<{ username: string | null; full_name: string | null }>();
  profile = byId.data ?? null;

  const username = typeof profile?.username === "string" ? profile.username.trim() : "";
  const fullName = typeof profile?.full_name === "string" ? profile.full_name.trim() : "";
  const shouldSuggestProfileSetup = !profile || !username || !fullName;

  return <DashboardClient forceProfileSetup={shouldSuggestProfileSetup} />;
}