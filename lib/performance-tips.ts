import { exerciseSubcategoriesByCategory } from "@/lib/training-data";

export const PERFORMANCE_TIPS_KEY = "bt.performance-tips.v1";

/** @deprecated Legacy scopes — migrated on load. */
type LegacyTipScope = "game" | "game_training" | "subcategory";

export type TipScope = "spielnotizen" | "basketball_training";

export type PerformanceTip = {
  id: string;
  title: string;
  content: string;
  scope: TipScope | LegacyTipScope;
  scopeValue?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function makeTip(
  id: string,
  title: string,
  content: string,
  scope: TipScope,
  scopeValue?: string,
): PerformanceTip {
  const now = nowIso();
  return {
    id,
    title,
    content,
    scope,
    scopeValue,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function getDefaultPerformanceTips(): PerformanceTip[] {
  return [
    makeTip("tip-shooting-1", "Shooting", "Aus den Beinen werfen", "basketball_training", "Shooting"),
    makeTip("tip-shooting-2", "Shooting", "Höher werden (höherer Arch)", "basketball_training", "Shooting"),
    makeTip("tip-shooting-3", "Shooting", "Follow thru", "basketball_training", "Shooting"),
    makeTip("tip-shooting-4", "Shooting", "Mit Confidence", "basketball_training", "Shooting"),
    makeTip("tip-shooting-5", "Shooting", "Gerade hoch, nicht nach vorne", "basketball_training", "Shooting"),
    makeTip("tip-ft-1", "Free Throws", "Aus den Beinen werfen", "basketball_training", "Shooting"),
    makeTip("tip-ft-2", "Free Throws", "Hoher Arch", "basketball_training", "Shooting"),
    makeTip("tip-ft-3", "Free Throws", "Follow thru", "basketball_training", "Shooting"),
    makeTip("tip-ft-4", "Free Throws", "Nicht nach hinten, gerade noch", "basketball_training", "Shooting"),
    makeTip("tip-ft-5", "Free Throws", "Mit Ruhe", "basketball_training", "Shooting"),
    makeTip("tip-dribbling-1", "Dribbling", "Nicht dribbeln, außer wenn freier Weg dann mit Geschwindigkeit", "basketball_training", "Handles"),
    makeTip("tip-dribbling-2", "Dribbling", "Sonst Ball sichern -> an Haile, Salva", "basketball_training", "Handles"),
    makeTip("tip-finishing-1", "Zug zum Korb", "Ball oben halten", "basketball_training", "Finishing"),
    makeTip("tip-finishing-2", "Zug zum Korb", "Ball erst aufnehmen/springen, wenn klarer Plan", "basketball_training", "Finishing"),
    makeTip("tip-finishing-3", "Zug zum Korb", "Bei Euro Step Ball über Defender drüber (Donovan Mitchell)", "basketball_training", "Finishing"),
    makeTip("tip-finishing-4", "Zug zum Korb", "Beim Pass schon in den Pass reinlaufen (Pascal Siakam)", "basketball_training", "Finishing"),
    makeTip("tip-post-1", "Post Moves", "Tief anbieten, mit einem Move reinspringen und volle Power hoch", "spielnotizen"),
    makeTip("tip-post-2", "Post Moves", "Mit tiefer Schulter und Ellbogen Space kreieren", "spielnotizen"),
    makeTip("tip-post-3", "Post Moves", "Bei Help D Kick Out suchen", "spielnotizen"),
    makeTip("tip-post-4", "Post Moves", "Wichtig: zum Korb, strong finishen, Rebound holen", "spielnotizen"),
    makeTip("tip-system-1", "Systeme", "Kommunikation mit 2. Big: wer ist 5", "spielnotizen"),
    makeTip("tip-system-2", "Systeme", "Bei 2 quick: Screen an der Dreierlinie", "spielnotizen"),
    makeTip("tip-system-3", "Systeme", "Bei Horn zuerst D reindrücken, dann Screen stellen", "spielnotizen"),
    makeTip("tip-screen-1", "Screens", "Screens stark und breit stellen, nicht bewegen", "spielnotizen"),
    makeTip("tip-screen-2", "Screens", "Stark zum Korb rollen", "spielnotizen"),
    makeTip("tip-floater-1", "Floater", "Zwei Beine -> hoher Floater -> zum Korb", "spielnotizen"),
    makeTip("tip-defense-1", "Defense", "Welche Art von D spielen wir? Man-to-Man, Zone, Teilzone?", "spielnotizen"),
    makeTip("tip-defense-2", "Defense", "Arme hoch, viel reden, auf Cuts achten, keine Fouls", "spielnotizen"),
    makeTip("tip-defense-3", "Defense", "Erster in der Zone sein", "spielnotizen"),
    makeTip("tip-vs-zone-1", "Gegen Zone", "Im Dunkerspot anbieten, Löcher ausnutzen, X-Spielzug", "spielnotizen"),
    makeTip("tip-vs-zone-2", "Gegen Zone", "Beim Wurf direkt für Rebound bereit sein", "spielnotizen"),
  ];
}

function migrateTipScope(tip: PerformanceTip): PerformanceTip {
  if (tip.scope === "game" || tip.scope === "game_training") {
    return { ...tip, scope: "spielnotizen" };
  }
  if (tip.scope === "subcategory") {
    return { ...tip, scope: "basketball_training" };
  }
  if (tip.scope === "basketball_training" && !tip.scopeValue?.trim()) {
    return { ...tip, scope: "basketball_training", scopeValue: "Shooting" };
  }
  return tip;
}

function normalizeTips(tips: PerformanceTip[]): PerformanceTip[] {
  return tips.map(migrateTipScope);
}

export function loadPerformanceTips() {
  if (typeof window === "undefined") return getDefaultPerformanceTips();
  const raw = window.localStorage.getItem(PERFORMANCE_TIPS_KEY);
  if (!raw) {
    const defaults = getDefaultPerformanceTips();
    window.localStorage.setItem(PERFORMANCE_TIPS_KEY, JSON.stringify(defaults));
    return defaults;
  }
  try {
    const parsed = JSON.parse(raw) as PerformanceTip[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const defaults = getDefaultPerformanceTips();
      window.localStorage.setItem(PERFORMANCE_TIPS_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const migrated = normalizeTips(parsed);
    const needsPersist = migrated.some((tip, index) => tip.scope !== parsed[index]?.scope);
    if (needsPersist) savePerformanceTips(migrated);
    return migrated;
  } catch {
    return getDefaultPerformanceTips();
  }
}

export function savePerformanceTips(tips: PerformanceTip[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PERFORMANCE_TIPS_KEY, JSON.stringify(tips));
  window.dispatchEvent(new Event("bt:performance-tips-updated"));
}

export function upsertPerformanceTip(
  tips: PerformanceTip[],
  draft: Omit<PerformanceTip, "id" | "createdAt" | "updatedAt"> & { id?: string },
) {
  const existing = draft.id ? tips.find((tip) => tip.id === draft.id) : null;
  const now = nowIso();
  const next: PerformanceTip = existing
    ? { ...existing, ...draft, updatedAt: now }
    : {
        ...draft,
        id: `tip-${Date.now()}`,
        createdAt: now,
        updatedAt: now,
      };
  const rest = tips.filter((tip) => tip.id !== next.id);
  return [next, ...rest];
}

export function removePerformanceTip(tips: PerformanceTip[], tipId: string) {
  return tips.filter((tip) => tip.id !== tipId);
}

export function getTipsForWorkoutContext(params: {
  tips: PerformanceTip[];
  basketballMode?: "basketball_training" | "game_training" | "game";
  subcategory?: string;
}) {
  const normalizedSubcategory = (params.subcategory ?? "").trim().toLowerCase();
  const mode = params.basketballMode ?? "basketball_training";

  return params.tips.filter((tip) => {
    if (!tip.active) return false;
    const scope = migrateTipScope(tip).scope;

    if (scope === "spielnotizen") {
      return mode === "game" || mode === "game_training";
    }

    if (scope === "basketball_training") {
      if (mode !== "basketball_training") return false;
      if (normalizedSubcategory.length === 0) return false;
      return (tip.scopeValue ?? "").trim().toLowerCase() === normalizedSubcategory;
    }

    return false;
  });
}

/** Teilt gefilterte Tipps in Spielnotizen und nach Basketball-Schwerpunkt. */
export function partitionTipsForDisplay(filtered: PerformanceTip[]): {
  general: PerformanceTip[];
  bySubcategory: Map<string, PerformanceTip[]>;
} {
  const general: PerformanceTip[] = [];
  const bySubcategory = new Map<string, PerformanceTip[]>();
  for (const tip of filtered) {
    const scope = migrateTipScope(tip).scope;
    if (scope === "basketball_training") {
      const key = (tip.scopeValue ?? "Sonstiges").trim() || "Sonstiges";
      const list = bySubcategory.get(key) ?? [];
      list.push(tip);
      bySubcategory.set(key, list);
    } else if (scope === "spielnotizen") {
      general.push(tip);
    }
  }
  return { general, bySubcategory };
}

export function orderedSubcategoryKeys(keys: string[]): string[] {
  const order = exerciseSubcategoriesByCategory.Basketball;
  return [...keys].sort((a, b) => {
    const ia = order.findIndex((x) => x.toLowerCase() === a.toLowerCase());
    const ib = order.findIndex((x) => x.toLowerCase() === b.toLowerCase());
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}
