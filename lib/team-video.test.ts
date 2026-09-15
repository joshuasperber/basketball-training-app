import { describe, expect, it } from "vitest";
import {
  isOwnedTeamVideoPath,
  isTeamVideoCategory,
  isTeamVideoMimeType,
  normalizeTeamVideoText,
  teamVideoExtension,
} from "@/lib/team-video";

describe("team video validation", () => {
  it("accepts only supported categories and formats", () => {
    expect(isTeamVideoCategory("offense")).toBe(true);
    expect(isTeamVideoCategory("defense")).toBe(true);
    expect(isTeamVideoCategory("other")).toBe(false);
    expect(isTeamVideoMimeType("video/mp4")).toBe(true);
    expect(isTeamVideoMimeType("text/html")).toBe(false);
    expect(teamVideoExtension("video/quicktime")).toBe("mov");
  });

  it("normalizes metadata and rejects paths outside the uploader folder", () => {
    const teamId = "9bb17168-894e-4b2e-961a-5a75d0f539f3";
    const userId = "a5256674-5943-47af-8843-f72a00ae243d";
    const fileId = "9ded4e4e-a124-4aa4-8c47-9ff1a79c9853";
    expect(normalizeTeamVideoText("  Horns   gegen Zone  ", 120)).toBe("Horns gegen Zone");
    expect(isOwnedTeamVideoPath(teamId, userId, `${teamId}/${userId}/${fileId}.mp4`)).toBe(true);
    expect(isOwnedTeamVideoPath(teamId, userId, `${teamId}/other/${fileId}.mp4`)).toBe(false);
    expect(isOwnedTeamVideoPath(teamId, userId, `${teamId}/${userId}/../clip.mp4`)).toBe(false);
  });
});
