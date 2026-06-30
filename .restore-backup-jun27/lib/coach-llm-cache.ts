const COACH_LLM_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const COACH_LLM_CACHE_MAX = 48;

type CacheEntry = { at: number; body: unknown };

const llmResponseCache = new Map<string, CacheEntry>();

export function stableCoachPayloadHash(intent: string, payload: Record<string, unknown>): string {
  const keys = Object.keys(payload).sort();
  const slice = keys.slice(0, 24).map((key) => {
    const value = payload[key];
    if (value == null) return `${key}:`;
    if (typeof value === "string") return `${key}:${value.slice(0, 120)}`;
    if (typeof value === "number" || typeof value === "boolean") return `${key}:${value}`;
    try {
      return `${key}:${JSON.stringify(value).slice(0, 200)}`;
    } catch {
      return `${key}:*`;
    }
  });
  return `${intent}|${slice.join("|")}`;
}

export function readLlmCache(key: string): unknown | null {
  const hit = llmResponseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > COACH_LLM_CACHE_TTL_MS) {
    llmResponseCache.delete(key);
    return null;
  }
  return hit.body;
}

export function writeLlmCache(key: string, body: unknown) {
  if (llmResponseCache.size >= COACH_LLM_CACHE_MAX) {
    const oldest = [...llmResponseCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) llmResponseCache.delete(oldest[0]);
  }
  llmResponseCache.set(key, { at: Date.now(), body });
}

export type StoredCoachCoaching = {
  headline: string;
  bullets: string[];
  source?: "heuristic" | "llm";
  warning?: string;
  at: number;
  weekKey: string;
};

export function readStoredCoachingCache(): StoredCoachCoaching | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("bt.coach.llm.coaching.cache");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCoachCoaching;
    if (!parsed?.headline || !Array.isArray(parsed.bullets)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredCoachingCache(data: Omit<StoredCoachCoaching, "at">) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      "bt.coach.llm.coaching.cache",
      JSON.stringify({ ...data, at: Date.now() } satisfies StoredCoachCoaching),
    );
  } catch {
    /* ignore */
  }
}
