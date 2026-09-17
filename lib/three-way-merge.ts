export type ThreeWayMergeResult<T> = {
  value: T;
  /** Pfade, an denen beide Seiten denselben skalaren Wert geändert haben. */
  collisions: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function stableValue(value: unknown): unknown {
  if (value === undefined) return { __syncUndefined: true };
  if (Array.isArray(value)) return value.map(stableValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function itemId(value: unknown): string | null {
  if (!isPlainObject(value) || typeof value.id !== "string" || !value.id) return null;
  return value.id;
}

function supportsIdMerge(...values: unknown[]) {
  const entries = values.flatMap((value) => (Array.isArray(value) ? value : []));
  return entries.length > 0 && entries.every((entry) => itemId(entry) !== null);
}

function childPath(parent: string, key: string) {
  return parent ? `${parent}.${key}` : key;
}

function mergeNode(base: unknown, remote: unknown, local: unknown, path: string): ThreeWayMergeResult<unknown> {
  if (valuesEqual(local, remote)) return { value: local, collisions: [] };
  if (valuesEqual(local, base)) return { value: remote, collisions: [] };
  if (valuesEqual(remote, base)) return { value: local, collisions: [] };

  if (isPlainObject(remote) && isPlainObject(local)) {
    const baseObject = isPlainObject(base) ? base : {};
    const keys = new Set([
      ...Object.keys(baseObject),
      ...Object.keys(remote),
      ...Object.keys(local),
    ]);
    const value: Record<string, unknown> = {};
    const collisions: string[] = [];
    for (const key of keys) {
      const merged = mergeNode(baseObject[key], remote[key], local[key], childPath(path, key));
      if (merged.value !== undefined) value[key] = merged.value;
      collisions.push(...merged.collisions);
    }
    return { value, collisions };
  }

  if (Array.isArray(remote) && Array.isArray(local) && supportsIdMerge(base, remote, local)) {
    const baseById = new Map((Array.isArray(base) ? base : []).flatMap((entry) => {
      const id = itemId(entry);
      return id ? [[id, entry] as const] : [];
    }));
    const remoteById = new Map(remote.flatMap((entry) => {
      const id = itemId(entry);
      return id ? [[id, entry] as const] : [];
    }));
    const localById = new Map(local.flatMap((entry) => {
      const id = itemId(entry);
      return id ? [[id, entry] as const] : [];
    }));
    const orderedIds = [
      ...remoteById.keys(),
      ...[...localById.keys()].filter((id) => !remoteById.has(id)),
      ...[...baseById.keys()].filter((id) => !remoteById.has(id) && !localById.has(id)),
    ];
    const value: unknown[] = [];
    const collisions: string[] = [];
    for (const id of orderedIds) {
      const merged = mergeNode(
        baseById.get(id),
        remoteById.get(id),
        localById.get(id),
        `${path || "items"}[${id}]`,
      );
      if (merged.value !== undefined) value.push(merged.value);
      collisions.push(...merged.collisions);
    }
    return { value, collisions };
  }

  // Bei einer echten gleichzeitigen Änderung gewinnt die aktive lokale
  // Bearbeitung. Der Pfad bleibt als Diagnose erhalten, ohne den Nutzer mit
  // einer Auswahl zwischen zwei vollständigen Snapshots zu unterbrechen.
  return { value: local, collisions: [path || "root"] };
}

/**
 * Führt JSON-kompatible Daten anhand eines gemeinsamen Basisstands zusammen.
 * Unterschiedliche Objektfelder und Einträge mit stabiler `id` bleiben dabei
 * vollständig erhalten; nur dieselbe gleichzeitig geänderte Eigenschaft nutzt
 * deterministisch die lokale Version.
 */
export function mergeThreeWayJson<T>(base: T | undefined, remote: T, local: T): ThreeWayMergeResult<T> {
  const result = mergeNode(base, remote, local, "");
  return { value: result.value as T, collisions: result.collisions };
}
