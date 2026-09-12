const DEFAULT_AUTH_DESTINATION = "/dashboard";

/** Only same-origin absolute paths are allowed after authentication. */
export function safeInternalPath(
  value: string | null | undefined,
  fallback = DEFAULT_AUTH_DESTINATION,
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\")) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return value;
}
