/** Extrahiert den Einladungs-Token aus Rohtext oder Einladungs-URL. */

const TOKEN_IN_URL = /[?&]join=([^&#]+)/i;
const TOKEN_PLAIN = /^bt-[a-f0-9]{20}$/i;

export function parseJoinInviteToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const fromQuery = url.searchParams.get("join")?.trim();
      if (fromQuery) return decodeURIComponent(fromQuery);
    }
  } catch {
    // fall through
  }

  const fromPartialUrl = trimmed.match(TOKEN_IN_URL);
  if (fromPartialUrl?.[1]) {
    try {
      return decodeURIComponent(fromPartialUrl[1].trim());
    } catch {
      return fromPartialUrl[1].trim();
    }
  }

  if (TOKEN_PLAIN.test(trimmed)) return trimmed.toLowerCase();

  return trimmed;
}

export function isLikelyInviteToken(token: string): boolean {
  return TOKEN_PLAIN.test(token.trim());
}
