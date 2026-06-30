import { describe, expect, it } from "vitest";
import {
  buildYoutubeTheGameTimeHighlightsSearchUrl,
  formatHighlightsSearchDate,
} from "@/lib/sports-news-highlights-date";

describe("formatHighlightsSearchDate", () => {
  it("formats ISO day as English month name with zero-padded day", () => {
    expect(formatHighlightsSearchDate("2026-06-03")).toBe("June 03 2026");
    expect(formatHighlightsSearchDate("2026-06-13")).toBe("June 13 2026");
  });
});

describe("buildYoutubeTheGameTimeHighlightsSearchUrl", () => {
  it("uses readable date in search query", () => {
    const url = buildYoutubeTheGameTimeHighlightsSearchUrl(
      "New York Knicks",
      "San Antonio Spurs",
      "2026-06-03",
    );
    expect(url).toContain(encodeURIComponent("New York Knicks San Antonio Spurs NBA Highlights June 03 2026"));
  });
});
