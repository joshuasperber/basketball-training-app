import { NextRequest, NextResponse } from "next/server";
import {
  transferOrDeleteTeamsOwnedByUser,
  deleteUserGamePhotos,
  deleteUserProgressRows,
} from "@/lib/server/account-delete";
import { clearSessionCookies } from "@/lib/server/session-cookies";
import { getRequestUser, getSupabaseServiceConfig, supabaseRest } from "@/lib/server/supabase-admin";

export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== "DELETE") {
    return NextResponse.json({ error: "confirmation_required" }, { status: 400 });
  }

  const config = getSupabaseServiceConfig();
  if (!config) return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });

  const photosDeleted = await deleteUserGamePhotos(user.id);
  const teamsTransferred = await transferOrDeleteTeamsOwnedByUser(user.id);
  const progressDeleted = await deleteUserProgressRows(user.id, user.email);
  const profileDeleted = await supabaseRest(`profiles?id=eq.${user.id}`, { method: "DELETE" });
  const membershipsDeleted = await supabaseRest(`team_members?user_id=eq.${user.id}`, { method: "DELETE" });
  const exercisesDeleted = await supabaseRest(`exercises?user_id=eq.${user.id}`, { method: "DELETE" });

  if (
    !photosDeleted ||
    !teamsTransferred ||
    !progressDeleted ||
    !profileDeleted.ok ||
    !membershipsDeleted.ok ||
    !exercisesDeleted.ok
  ) {
    return NextResponse.json({ error: "data_delete_incomplete" }, { status: 502 });
  }

  const authDelete = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: "DELETE",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!authDelete.ok) {
    return NextResponse.json({ error: "auth_delete_failed" }, { status: 502 });
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response, request);
  return response;
}
