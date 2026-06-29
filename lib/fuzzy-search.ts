export function fuzzyMatchScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q || !t) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 + Math.round((q.length / t.length) * 100);
  if (t.includes(q)) return 600 + Math.round((q.length / t.length) * 100);

  let qi = 0;
  let score = 0;
  let consecutive = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) {
      consecutive += 1;
      score += consecutive * 2;
      qi += 1;
    } else {
      consecutive = 0;
    }
  }
  if (qi < q.length) return 0;
  return 150 + score;
}

export function scoreSearchableText(query: string, parts: Array<string | undefined | null>): number {
  let best = 0;
  for (const part of parts) {
    if (!part) continue;
    best = Math.max(best, fuzzyMatchScore(query, part));
  }
  return best;
}

export function rankByFuzzySearch<T>(
  items: T[],
  query: string,
  getSearchParts: (item: T) => Array<string | undefined | null>,
): Array<{ item: T; score: number }> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return items
    .map((item) => ({ item, score: scoreSearchableText(trimmed, getSearchParts(item)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}
