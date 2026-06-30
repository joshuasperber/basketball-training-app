import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseRest } from "@/lib/server/supabase-admin";

type ProfilePayload = {
  username?: string;
  full_name?: string | null;
  favorite_position?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
};

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as ProfilePayload | null;
  if (!body?.username?.trim()) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const payload = {
    id: user.id,
    username: body.username.trim(),
    full_name: body.full_name ?? null,
    favorite_position: body.favorite_position ?? null,
    height_cm: body.height_cm ?? null,
    weight_kg: body.weight_kg ?? null,
  };

  const result = await supabaseRest("profiles", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    return NextResponse.json({ error: "upsert_failed", detail: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
