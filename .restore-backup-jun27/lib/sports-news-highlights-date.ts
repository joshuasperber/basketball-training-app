/** YouTube-Highlight-Suche: „June 03 2026“ statt ISO „2026-06-03“. */
export function formatHighlightsSearchDate(dateDay: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateDay.trim());
  if (!match) return dateDay;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return dateDay;
  const date = new Date(Date.UTC(year, month - 1, day));
  const monthName = date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${monthName} ${String(day).padStart(2, "0")} ${year}`;
}

export function buildYoutubeTheGameTimeHighlightsSearchUrl(
  awayFull: string,
  homeFull: string,
  dateDay: string,
): string {
  const q = `${awayFull} ${homeFull} NBA Highlights ${formatHighlightsSearchDate(dateDay)}`;
  return `https://www.youtube.com/@TheGametimeHighlights/search?query=${encodeURIComponent(q)}`;
}
