/**
 * Wenn die Nutzer:in ein konkretes YouTube-Video setzt (Spoiler-Video für alle Spiele),
 * wird diese URL verwendet. Andernfalls pro Spiel die Kanal-Suche (TheGameTimeHighlights).
 */
export function isYoutubeSpecificVideoUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (u.includes("youtu.be/")) return true;
  if (!u.includes("youtube.com")) return false;
  if (u.includes("/watch") && u.includes("v=")) return true;
  if (u.includes("/live/")) return true;
  if (u.includes("/shorts/")) return true;
  return false;
}

export function resolveGameHighlightsYoutubeUrl(userPreferenceUrl: string, itemSearchUrl: string): string {
  const pref = userPreferenceUrl.trim();
  if (pref && isYoutubeSpecificVideoUrl(pref)) return pref;
  const item = itemSearchUrl.trim();
  if (item) return item;
  return pref;
}
