import { describe, expect, it } from "vitest";
import {
  isOwnedTeamVideoPath,
  isTeamImageMimeType,
  isTeamVideoCategory,
  isTeamVideoMimeType,
  maxBytesForMediaKind,
  mimeTypeMatchesMediaKind,
  normalizeTeamMediaLink,
  normalizeTeamVideoText,
  TEAM_IMAGE_MAX_BYTES,
  TEAM_VIDEO_MAX_BYTES,
  teamVideoExtension,
} from "@/lib/team-video";

describe("team video validation", () => {
  it("accepts only supported categories and formats", () => {
    expect(isTeamVideoCategory("offense")).toBe(true);
    expect(isTeamVideoCategory("defense")).toBe(true);
    expect(isTeamVideoCategory("other")).toBe(false);
    expect(isTeamVideoMimeType("video/mp4")).toBe(true);
    expect(isTeamVideoMimeType("text/html")).toBe(false);
    expect(isTeamImageMimeType("image/png")).toBe(true);
    expect(isTeamImageMimeType("image/gif")).toBe(false);
    expect(teamVideoExtension("video/quicktime")).toBe("mov");
    expect(teamVideoExtension("image/jpeg")).toBe("jpg");
  });

  it("keeps uploads and their media kind consistent", () => {
    expect(mimeTypeMatchesMediaKind("image/webp", "image")).toBe(true);
    expect(mimeTypeMatchesMediaKind("image/webp", "video_upload")).toBe(false);
    expect(mimeTypeMatchesMediaKind("video/mp4", "video_upload")).toBe(true);
    expect(mimeTypeMatchesMediaKind("video/mp4", "video_link")).toBe(false);
    expect(maxBytesForMediaKind("image")).toBe(TEAM_IMAGE_MAX_BYTES);
    expect(maxBytesForMediaKind("video_upload")).toBe(TEAM_VIDEO_MAX_BYTES);
  });

  it("normalizes metadata and rejects paths outside the uploader folder", () => {
    const teamId = "9bb17168-894e-4b2e-961a-5a75d0f539f3";
    const userId = "a5256674-5943-47af-8843-f72a00ae243d";
    const fileId = "9ded4e4e-a124-4aa4-8c47-9ff1a79c9853";
    expect(normalizeTeamVideoText("  Horns   gegen Zone  ", 120)).toBe("Horns gegen Zone");
    expect(isOwnedTeamVideoPath(teamId, userId, `${teamId}/${userId}/${fileId}.mp4`)).toBe(true);
    expect(isOwnedTeamVideoPath(teamId, userId, `${teamId}/${userId}/${fileId}.png`)).toBe(true);
    expect(isOwnedTeamVideoPath(teamId, userId, `${teamId}/${userId}/${fileId}.svg`)).toBe(false);
    expect(isOwnedTeamVideoPath(teamId, userId, `${teamId}/other/${fileId}.mp4`)).toBe(false);
    expect(isOwnedTeamVideoPath(teamId, userId, `${teamId}/${userId}/../clip.mp4`)).toBe(false);
  });

  it("accepts only http(s) media links and derives YouTube thumbnails", () => {
    expect(normalizeTeamMediaLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      provider: "youtube",
      thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
    expect(normalizeTeamMediaLink("youtu.be/dQw4w9WgXcQ")?.thumbnailUrl)
      .toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(normalizeTeamMediaLink("https://vimeo.com/76979871")?.provider).toBe("vimeo");
    expect(normalizeTeamMediaLink("https://hudl.com/video/abc")?.provider).toBe("other");
    expect(normalizeTeamMediaLink("javascript:alert(1)")).toBeNull();
    expect(normalizeTeamMediaLink("data:text/html;base64,AAAA")).toBeNull();
    expect(normalizeTeamMediaLink("nur-ein-text")).toBeNull();
    expect(normalizeTeamMediaLink(`https://example.com/${"x".repeat(600)}`)).toBeNull();
  });
});
