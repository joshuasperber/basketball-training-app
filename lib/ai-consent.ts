import { pushProgressToCloud } from "@/lib/progress-sync";

const PROFILE_CACHE_KEY = "profile_cache_v4";

export const AI_CONSENT_UPDATED_EVENT = "bt:ai-consent-updated";

type ProfileCacheWithConsent = {
  aiConsentAt?: string | null;
  [key: string]: unknown;
};

function readProfileCache(): ProfileCacheWithConsent {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ProfileCacheWithConsent;
  } catch {
    return {};
  }
}

function writeProfileCache(cache: ProfileCacheWithConsent) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(cache));
  window.dispatchEvent(new Event(AI_CONSENT_UPDATED_EVENT));
}

export function getAiConsentAt(): string | null {
  const at = readProfileCache().aiConsentAt;
  return typeof at === "string" && at.length > 0 ? at : null;
}

export function hasAiConsent(): boolean {
  return getAiConsentAt() != null;
}

export async function grantAiConsent(): Promise<void> {
  const cache = readProfileCache();
  cache.aiConsentAt = new Date().toISOString();
  writeProfileCache(cache);
  await pushProgressToCloud({ profileCache: JSON.stringify(cache) }, { quiet: true });
}

export async function revokeAiConsent(): Promise<void> {
  const cache = readProfileCache();
  delete cache.aiConsentAt;
  writeProfileCache(cache);
  await pushProgressToCloud({ profileCache: JSON.stringify(cache) }, { quiet: true });
}

/** Parse aiConsentAt from synced profile_cache JSON (client or server). */
export function parseAiConsentAtFromProfileCache(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as ProfileCacheWithConsent;
    const at = parsed.aiConsentAt;
    return typeof at === "string" && at.length > 0 ? at : null;
  } catch {
    return null;
  }
}
