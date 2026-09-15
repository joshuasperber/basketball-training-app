import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, getSupabaseServiceConfig, supabaseRest } from "@/lib/server/supabase-admin";
import { isUuid, postgrestPath } from "@/lib/server/postgrest-query";
import type { TeamRole } from "@/lib/team-types";
import {
  isOwnedTeamVideoPath,
  isTeamMediaKind,
  isTeamMediaMimeType,
  isTeamVideoCategory,
  maxBytesForMediaKind,
  mimeTypeMatchesMediaKind,
  normalizeTeamMediaLink,
  normalizeTeamVideoText,
  TEAM_VIDEO_BUCKET,
  TEAM_VIDEO_DESCRIPTION_MAX_LENGTH,
  TEAM_VIDEO_TITLE_MAX_LENGTH,
  teamVideoExtension,
  type TeamMediaKind,
  type TeamMediaMimeType,
  type TeamVideoCategory,
  type TeamVideoView,
} from "@/lib/team-video";

type MemberRow = {
  user_id: string;
  role: TeamRole;
  display_name: string | null;
};

type VideoRow = {
  id: string;
  team_id: string;
  uploaded_by: string | null;
  uploader_name: string;
  title: string;
  description: string | null;
  category: TeamVideoCategory;
  media_kind: TeamMediaKind | null;
  storage_path: string | null;
  link_url: string | null;
  mime_type: TeamMediaMimeType | null;
  file_size: number | null;
  duration_seconds: number | null;
  created_at: string;
};

const VIDEO_SELECT = "id,team_id,uploaded_by,uploader_name,title,description,category,media_kind,storage_path,link_url,mime_type,file_size,duration_seconds,created_at";

async function getMembership(teamId: string, userId: string): Promise<MemberRow | null> {
  const result = await supabaseRest<MemberRow[]>(postgrestPath("team_members", {
    team_id: `eq.${teamId}`,
    user_id: `eq.${userId}`,
    select: "user_id,role,display_name",
    limit: 1,
  }));
  return result.ok ? result.data?.[0] ?? null : null;
}

function encodeStoragePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function createSignedUploadUrl(path: string): Promise<string | null> {
  const config = getSupabaseServiceConfig();
  if (!config) return null;
  const response = await fetch(
    `${config.url}/storage/v1/object/upload/sign/${encodeURIComponent(TEAM_VIDEO_BUCKET)}/${encodeStoragePath(path)}`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        "x-upsert": "false",
      },
      body: "{}",
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { url?: string };
  if (!data.url) return null;
  return data.url.startsWith("http") ? data.url : `${config.url}/storage/v1${data.url}`;
}

async function createSignedPlaybackUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const config = getSupabaseServiceConfig();
  if (!config) return null;
  const response = await fetch(
    `${config.url}/storage/v1/object/sign/${encodeURIComponent(TEAM_VIDEO_BUCKET)}/${encodeStoragePath(path)}`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 21_600 }),
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { signedURL?: string; signedUrl?: string };
  const relative = data.signedURL ?? data.signedUrl;
  if (!relative) return null;
  return relative.startsWith("http") ? relative : `${config.url}/storage/v1${relative}`;
}

async function deleteStoragePath(path: string | null): Promise<boolean> {
  if (!path) return true;
  const config = getSupabaseServiceConfig();
  if (!config) return false;
  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(TEAM_VIDEO_BUCKET)}`, {
    method: "DELETE",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: [path] }),
    cache: "no-store",
  });
  return response.ok || response.status === 404;
}

function toView(row: VideoRow, signedUrl: string | null, userId: string, role: TeamRole): TeamVideoView {
  return {
    id: row.id,
    teamId: row.team_id,
    uploadedBy: row.uploaded_by,
    uploaderName: row.uploader_name,
    title: row.title,
    description: row.description,
    category: row.category,
    mediaKind: isTeamMediaKind(row.media_kind) ? row.media_kind : "video_upload",
    storagePath: row.storage_path,
    linkUrl: row.link_url,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
    signedUrl,
    canDelete: row.uploaded_by === userId || role === "owner" || role === "captain",
  };
}

function schemaMissing(status: number, error?: string) {
  return status === 404 || Boolean(error?.includes("PGRST205") || error?.includes("team_videos"));
}

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const teamId = request.nextUrl.searchParams.get("teamId")?.trim() ?? "";
  if (!isUuid(teamId)) return NextResponse.json({ error: "invalid_team" }, { status: 400 });
  const membership = await getMembership(teamId, user.id);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const result = await supabaseRest<VideoRow[]>(postgrestPath("team_videos", {
    team_id: `eq.${teamId}`,
    select: VIDEO_SELECT,
    order: "created_at.desc",
    limit: 100,
  }));
  if (!result.ok) {
    return NextResponse.json(
      { error: schemaMissing(result.status, result.error) ? "schema_missing" : "read_failed" },
      { status: schemaMissing(result.status, result.error) ? 503 : 502 },
    );
  }

  const rows = result.data ?? [];
  const urls = await Promise.all(rows.map((row) => createSignedPlaybackUrl(row.storage_path)));
  return NextResponse.json({
    videos: rows.map((row, index) => toView(row, urls[index] ?? null, user.id, membership.role)),
  });
}

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    action?: "prepare" | "complete" | "link";
    teamId?: string;
    title?: string;
    description?: string;
    category?: string;
    mediaKind?: string;
    mimeType?: string;
    fileSize?: number;
    durationSeconds?: number | null;
    storagePath?: string;
    linkUrl?: string;
  } | null;
  const teamId = body?.teamId?.trim() ?? "";
  if (!isUuid(teamId)) return NextResponse.json({ error: "invalid_team" }, { status: 400 });
  const membership = await getMembership(teamId, user.id);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const title = normalizeTeamVideoText(body?.title, TEAM_VIDEO_TITLE_MAX_LENGTH);
  const description = normalizeTeamVideoText(body?.description, TEAM_VIDEO_DESCRIPTION_MAX_LENGTH);
  const mediaKind: TeamMediaKind = isTeamMediaKind(body?.mediaKind) ? body.mediaKind : "video_upload";
  if (!title || !isTeamVideoCategory(body?.category)) {
    return NextResponse.json({ error: "invalid_video" }, { status: 400 });
  }

  const insertBase = {
    team_id: teamId,
    uploaded_by: user.id,
    uploader_name: normalizeTeamVideoText(membership.display_name, 80) || user.email.split("@")[0],
    title,
    description: description || null,
    category: body.category,
  };

  if (mediaKind === "video_link") {
    const link = normalizeTeamMediaLink(body?.linkUrl);
    if (body?.action !== "link" || !link) return NextResponse.json({ error: "invalid_link" }, { status: 400 });
    const inserted = await supabaseRest<VideoRow[]>("team_videos", {
      method: "POST",
      prefer: "return=representation",
      body: JSON.stringify({
        ...insertBase,
        media_kind: mediaKind,
        link_url: link.url,
        storage_path: null,
        mime_type: null,
        file_size: null,
        duration_seconds: null,
      }),
    });
    const row = inserted.data?.[0];
    if (!inserted.ok || !row) {
      return NextResponse.json(
        { error: schemaMissing(inserted.status, inserted.error) ? "schema_missing" : "save_failed" },
        { status: schemaMissing(inserted.status, inserted.error) ? 503 : 502 },
      );
    }
    return NextResponse.json({ video: toView(row, null, user.id, membership.role) });
  }

  if (!getSupabaseServiceConfig()) return NextResponse.json({ error: "storage_unconfigured" }, { status: 503 });

  const fileSize = Number(body?.fileSize);
  if (
    !isTeamMediaMimeType(body?.mimeType)
    || !mimeTypeMatchesMediaKind(body.mimeType, mediaKind)
    || !Number.isInteger(fileSize)
    || fileSize <= 0
    || fileSize > maxBytesForMediaKind(mediaKind)
  ) {
    return NextResponse.json({ error: "invalid_video" }, { status: 400 });
  }

  if (body?.action === "prepare") {
    const path = `${teamId}/${user.id}/${randomUUID()}.${teamVideoExtension(body.mimeType)}`;
    const signedUrl = await createSignedUploadUrl(path);
    if (!signedUrl) return NextResponse.json({ error: "upload_url_failed" }, { status: 502 });
    return NextResponse.json({ storagePath: path, signedUrl });
  }

  const storagePath = body?.storagePath?.trim() ?? "";
  if (body?.action !== "complete" || !isOwnedTeamVideoPath(teamId, user.id, storagePath)) {
    return NextResponse.json({ error: "invalid_upload" }, { status: 400 });
  }

  const durationSeconds = mediaKind === "image" || !Number.isFinite(body.durationSeconds)
    ? null
    : Math.max(0, Math.round(Number(body.durationSeconds)));
  const inserted = await supabaseRest<VideoRow[]>("team_videos", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      ...insertBase,
      media_kind: mediaKind,
      storage_path: storagePath,
      link_url: null,
      mime_type: body.mimeType,
      file_size: fileSize,
      duration_seconds: durationSeconds,
    }),
  });
  const row = inserted.data?.[0];
  if (!inserted.ok || !row) {
    await deleteStoragePath(storagePath);
    return NextResponse.json(
      { error: schemaMissing(inserted.status, inserted.error) ? "schema_missing" : "save_failed" },
      { status: schemaMissing(inserted.status, inserted.error) ? 503 : 502 },
    );
  }

  const signedUrl = await createSignedPlaybackUrl(storagePath);
  return NextResponse.json({ video: toView(row, signedUrl, user.id, membership.role) });
}

export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { teamId?: string; videoId?: string } | null;
  const teamId = body?.teamId?.trim() ?? "";
  const videoId = body?.videoId?.trim() ?? "";
  if (!isUuid(teamId) || !isUuid(videoId)) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const membership = await getMembership(teamId, user.id);
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const result = await supabaseRest<VideoRow[]>(postgrestPath("team_videos", {
    id: `eq.${videoId}`,
    team_id: `eq.${teamId}`,
    select: VIDEO_SELECT,
    limit: 1,
  }));
  const video = result.data?.[0];
  if (!video) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (video.uploaded_by !== user.id && membership.role !== "owner" && membership.role !== "captain") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const storageDeleted = await deleteStoragePath(video.storage_path);
  const databaseDelete = await supabaseRest(postgrestPath("team_videos", { id: `eq.${videoId}`, team_id: `eq.${teamId}` }), {
    method: "DELETE",
  });
  if (!storageDeleted || !databaseDelete.ok) {
    return NextResponse.json({ error: "delete_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
