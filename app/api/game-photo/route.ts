import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, getSupabaseServiceConfig } from "@/lib/server/supabase-admin";

const BUCKET = "game-photos";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function userOwnsPath(userId: string, path: string) {
  return path.startsWith(`${userId}/`);
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const gameId = String(formData?.get("gameId") ?? "").trim();
  if (!(file instanceof Blob) || !gameId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: "unsupported_file_type" }, { status: 415 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(gameId)) {
    return NextResponse.json({ error: "invalid_game_id" }, { status: 400 });
  }

  const config = getSupabaseServiceConfig();
  if (!config) return NextResponse.json({ error: "storage_unconfigured" }, { status: 503 });

  const path = `${user.id}/${gameId}-${Date.now()}.jpg`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(BUCKET)}/${path}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": file.type || "image/jpeg",
      "x-upsert": "true",
    },
    body: buffer,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return NextResponse.json({ error: "upload_failed", detail: detail.slice(0, 200) }, { status: 502 });
  }

  return NextResponse.json({ path });
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const path = request.nextUrl.searchParams.get("path")?.trim();
  if (!path || !userOwnsPath(user.id, path)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  const config = getSupabaseServiceConfig();
  if (!config) return NextResponse.json({ error: "storage_unconfigured" }, { status: 503 });

  const response = await fetch(`${config.url}/storage/v1/object/sign/${encodeURIComponent(BUCKET)}/${path}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 3600 }),
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ error: "signed_url_failed" }, { status: 502 });
  }

  const json = (await response.json()) as { signedURL?: string; signedUrl?: string };
  const relative = json.signedURL ?? json.signedUrl;
  if (!relative) return NextResponse.json({ error: "signed_url_missing" }, { status: 502 });

  const signedUrl = relative.startsWith("http") ? relative : `${config.url}/storage/v1${relative}`;
  return NextResponse.json({ signedUrl });
}

export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { path?: string } | null;
  const path = body?.path?.trim();
  if (!path || !userOwnsPath(user.id, path)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  const config = getSupabaseServiceConfig();
  if (!config) return NextResponse.json({ error: "storage_unconfigured" }, { status: 503 });

  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(BUCKET)}`, {
    method: "DELETE",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: [path] }),
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ error: "delete_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
