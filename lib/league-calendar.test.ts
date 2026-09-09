import { describe, expect, it } from "vitest";
import { buildGoogleCalendarUrl, buildLeagueCalendarIcs } from "@/lib/league-calendar";
import type { LeagueScheduleEntry } from "@/lib/league";

const game: LeagueScheduleEntry = {
  id: "game-1",
  seasonId: "season-1",
  date: "2026-10-10",
  startTime: "18:00",
  meetingTime: "16:45",
  travelMinutes: 35,
  venueName: "Sporthalle Mitte",
  venueAddress: "Musterstraße 1",
  kind: "game",
  homeTeamId: "home",
  awayTeamId: "away",
};

const teamName = (id: string | undefined) => id === "home" ? "Spektrum" : id === "away" ? "Falcons" : "";

describe("league calendar exports", () => {
  it("builds an iCal event with game logistics", () => {
    const ics = buildLeagueCalendarIcs([game], teamName);
    expect(ics).toContain("DTSTART:20261010T180000");
    expect(ics).toContain("SUMMARY:Spektrum – Falcons");
    expect(ics).toContain("LOCATION:Sporthalle Mitte\\, Musterstraße 1");
    expect(ics).toContain("Treffpunkt: 16:45 Uhr");
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics).toContain("TRIGGER:-PT2H");
  });

  it("creates a Google Calendar template link", () => {
    const url = new URL(buildGoogleCalendarUrl(game, teamName));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("text")).toBe("Spektrum – Falcons");
    expect(url.searchParams.get("dates")).toBe("20261010T180000/20261010T200000");
  });
});
