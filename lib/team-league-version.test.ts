import { describe, expect, it } from "vitest";
import { createEmptyLeagueBundle } from "@/lib/league";
import { formatLeagueHistoryDate, normalizeLeagueHistory, summarizeLeagueChange } from "@/lib/team-league-version";

describe("shared league version helpers", () => {
  it("describes the most relevant league change", () => {
    const previous = createEmptyLeagueBundle();
    const next = {
      ...previous,
      players: [{ id: "p-1", teamId: previous.ownTeam.id, name: "Alex" }],
    };
    expect(summarizeLeagueChange(previous, next)).toBe("Spieler zum Kader hinzugefügt");
  });

  it("normalizes and limits untrusted history", () => {
    const history = normalizeLeagueHistory([
      null,
      { id: "1", at: "2026-09-15T10:00:00.000Z", summary: "Saison aktualisiert", userLabel: "Coach" },
      { id: 2, at: "invalid", summary: "ignored" },
    ]);
    expect(history).toEqual([{
      id: "1",
      at: "2026-09-15T10:00:00.000Z",
      summary: "Saison aktualisiert",
      userId: "",
      userLabel: "Coach",
    }]);
  });

  it("does not crash the UI for an invalid history timestamp", () => {
    expect(formatLeagueHistoryDate("invalid")).toBe("Zeitpunkt unbekannt");
  });
});
