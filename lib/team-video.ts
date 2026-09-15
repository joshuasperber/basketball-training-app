export const TEAM_VIDEO_BUCKET = "team-videos";
export const TEAM_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const TEAM_VIDEO_TITLE_MAX_LENGTH = 120;
export const TEAM_VIDEO_DESCRIPTION_MAX_LENGTH = 1_000;

export const TEAM_VIDEO_CATEGORIES = ["offense", "defense"] as const;
export type TeamVideoCategory = (typeof TEAM_VIDEO_CATEGORIES)[number];

export const TEAM_VIDEO_MIME_TYPES = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
} as const;

export type TeamVideoMimeType = keyof typeof TEAM_VIDEO_MIME_TYPES;

export type TeamVideoView = {
  id: string;
  teamId: string;
  uploadedBy: string | null;
  uploaderName: string;
  title: string;
  description: string | null;
  category: TeamVideoCategory;
  storagePath: string;
  mimeType: TeamVideoMimeType;
  fileSize: number;
  durationSeconds: number | null;
  createdAt: string;
  signedUrl: string | null;
  canDelete: boolean;
};

export function isTeamVideoCategory(value: unknown): value is TeamVideoCategory {
  return typeof value === "string" && TEAM_VIDEO_CATEGORIES.includes(value as TeamVideoCategory);
}

export function isTeamVideoMimeType(value: unknown): value is TeamVideoMimeType {
  return typeof value === "string" && Object.hasOwn(TEAM_VIDEO_MIME_TYPES, value);
}

export function normalizeTeamVideoText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function teamVideoExtension(mimeType: TeamVideoMimeType): string {
  return TEAM_VIDEO_MIME_TYPES[mimeType];
}

export function isOwnedTeamVideoPath(teamId: string, userId: string, path: string): boolean {
  const prefix = `${teamId}/${userId}/`;
  if (!path.startsWith(prefix)) return false;
  const fileName = path.slice(prefix.length);
  return /^[0-9a-f-]{36}\.(mp4|webm|mov)$/i.test(fileName) && !fileName.includes("/");
}

export function formatTeamVideoBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  return `${(bytes / (1024 * 1024)).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
}
