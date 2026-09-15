export const TEAM_VIDEO_BUCKET = "team-videos";
export const TEAM_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const TEAM_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const TEAM_VIDEO_TITLE_MAX_LENGTH = 120;
export const TEAM_VIDEO_DESCRIPTION_MAX_LENGTH = 1_000;
export const TEAM_MEDIA_LINK_MAX_LENGTH = 500;

export const TEAM_VIDEO_CATEGORIES = ["offense", "defense"] as const;
export type TeamVideoCategory = (typeof TEAM_VIDEO_CATEGORIES)[number];

export const TEAM_MEDIA_KINDS = ["video_upload", "video_link", "image"] as const;
export type TeamMediaKind = (typeof TEAM_MEDIA_KINDS)[number];

export const TEAM_VIDEO_MIME_TYPES = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
} as const;

export const TEAM_IMAGE_MIME_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type TeamVideoMimeType = keyof typeof TEAM_VIDEO_MIME_TYPES;
export type TeamImageMimeType = keyof typeof TEAM_IMAGE_MIME_TYPES;
export type TeamMediaMimeType = TeamVideoMimeType | TeamImageMimeType;

export type TeamMediaLink = {
  url: string;
  provider: "youtube" | "vimeo" | "other";
  thumbnailUrl: string | null;
};

export type TeamVideoView = {
  id: string;
  teamId: string;
  uploadedBy: string | null;
  uploaderName: string;
  title: string;
  description: string | null;
  category: TeamVideoCategory;
  mediaKind: TeamMediaKind;
  storagePath: string | null;
  linkUrl: string | null;
  mimeType: TeamMediaMimeType | null;
  fileSize: number | null;
  durationSeconds: number | null;
  createdAt: string;
  signedUrl: string | null;
  canDelete: boolean;
};

export function isTeamVideoCategory(value: unknown): value is TeamVideoCategory {
  return typeof value === "string" && TEAM_VIDEO_CATEGORIES.includes(value as TeamVideoCategory);
}

export function isTeamMediaKind(value: unknown): value is TeamMediaKind {
  return typeof value === "string" && TEAM_MEDIA_KINDS.includes(value as TeamMediaKind);
}

export function isTeamVideoMimeType(value: unknown): value is TeamVideoMimeType {
  return typeof value === "string" && Object.hasOwn(TEAM_VIDEO_MIME_TYPES, value);
}

export function isTeamImageMimeType(value: unknown): value is TeamImageMimeType {
  return typeof value === "string" && Object.hasOwn(TEAM_IMAGE_MIME_TYPES, value);
}

export function isTeamMediaMimeType(value: unknown): value is TeamMediaMimeType {
  return isTeamVideoMimeType(value) || isTeamImageMimeType(value);
}

export function mimeTypeMatchesMediaKind(mimeType: TeamMediaMimeType, mediaKind: TeamMediaKind): boolean {
  if (mediaKind === "image") return isTeamImageMimeType(mimeType);
  if (mediaKind === "video_upload") return isTeamVideoMimeType(mimeType);
  return false;
}

export function maxBytesForMediaKind(mediaKind: TeamMediaKind): number {
  return mediaKind === "image" ? TEAM_IMAGE_MAX_BYTES : TEAM_VIDEO_MAX_BYTES;
}

export function normalizeTeamVideoText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function teamVideoExtension(mimeType: TeamMediaMimeType): string {
  return isTeamImageMimeType(mimeType) ? TEAM_IMAGE_MIME_TYPES[mimeType] : TEAM_VIDEO_MIME_TYPES[mimeType];
}

export function isOwnedTeamVideoPath(teamId: string, userId: string, path: string): boolean {
  const prefix = `${teamId}/${userId}/`;
  if (!path.startsWith(prefix)) return false;
  const fileName = path.slice(prefix.length);
  return /^[0-9a-f-]{36}\.(mp4|webm|mov|jpg|png|webp)$/i.test(fileName) && !fileName.includes("/");
}

function youtubeVideoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "music.youtube.com") return null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const embedded = /^\/(?:embed|shorts|live|v)\/([^/]+)/.exec(url.pathname);
  return embedded?.[1] ?? null;
}

/**
 * Only absolute http(s) links are accepted — the URL is rendered as an outgoing
 * link, so anything script-like (javascript:, data:) must never pass.
 */
export function normalizeTeamMediaLink(value: unknown): TeamMediaLink | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > TEAM_MEDIA_LINK_MAX_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".")) return null;
  const href = url.toString();
  if (href.length > TEAM_MEDIA_LINK_MAX_LENGTH) return null;

  const youtubeId = youtubeVideoId(url);
  if (youtubeId && /^[\w-]{6,20}$/.test(youtubeId)) {
    return {
      url: href,
      provider: "youtube",
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }
  if (url.hostname.replace(/^www\./, "").endsWith("vimeo.com")) {
    return { url: href, provider: "vimeo", thumbnailUrl: null };
  }
  return { url: href, provider: "other", thumbnailUrl: null };
}

export function formatTeamVideoBytes(bytes: number | null): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}
