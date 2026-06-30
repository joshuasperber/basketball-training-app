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

  try {
    const supabase = createClient({ accessToken });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      redirect("/login?next=/dashboard");
    }
  } catch {
    // Supabase unreachable (network/TLS/proxy) — render client UI; cloud sync retries in browser.
  }

  return <DashboardClient />;
}
