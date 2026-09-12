const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailAddress(value: string) {
  const normalized = value.trim();
  return normalized.length <= 254 && EMAIL_PATTERN.test(normalized);
}
