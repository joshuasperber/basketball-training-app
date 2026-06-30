import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("sb-access-token")?.value;
  const refreshToken = cookieStore.get("sb-refresh-token")?.value;
  if (!accessToken && !refreshToken) {
    redirect("/login?next=/dashboard&reason=missing_session");
  }

  // Cookies sind gesetzt (Proxy hat durchgelassen) — Client prüft /api/auth/me und refresht bei Bedarf.
  return <DashboardClient />;
}
