import { exerciseSubcategoriesByCategory } from "@/lib/training-data";

export const PERFORMANCE_TIPS_KEY = "bt.performance-tips.v1";

export type TipScope = "game" | "game_training" | "basketball_training" | "subcategory";

export type PerformanceTip = {
  id: string;
  title: string;
  content: string;
  scope: TipScope;
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
    makeTip("tip-shooting-1", "Shooting", "Aus den Beinen werfen", "subcategory", "Shooting"),
    makeTip("tip-shooting-2", "Shooting", "Höher werden (höherer Arch)", "subcategory", "Shooting"),
    makeTip("tip-shooting-3", "Shooting", "Follow thru", "subcategory", "Shooting"),
    makeTip("tip-shooting-4", "Shooting", "Mit Confidence", "subcategory", "Shooting"),
    makeTip("tip-shooting-5", "Shooting", "Gerade hoch, nicht nach vorne", "subcategory", "Shooting"),
    makeTip("tip-ft-1", "Free Throws", "Aus den Beinen werfen", "subcategory", "Shooting"),
    makeTip("tip-ft-2", "Free Throws", "Hoher Arch", "subcategory", "Shooting"),
    makeTip("tip-ft-3", "Free Throws", "Follow thru", "subcategory", "Shooting"),
    makeTip("tip-ft-4", "Free Throws", "Nicht nach hinten, gerade noch", "subcategory", "Shooting"),
    makeTip("tip-ft-5", "Free Throws", "Mit Ruhe", "subcategory", "Shooting"),
    makeTip("tip-dribbling-1", "Dribbling", "Nicht dribbeln, außer wenn freier Weg dann mit Geschwindigkeit", "subcategory", "Handles"),
    makeTip("tip-dribbling-2", "Dribbling", "Sonst Ball sichern -> an Haile, Salva", "subcategory", "Handles"),
    makeTip("tip-finishing-1", "Zug zum Korb", "Ball oben halten", "subcategory", "Finishing"),
    makeTip("tip-finishing-2", "Zug zum Korb", "Ball erst aufnehmen/springen, wenn klarer Plan", "subcategory", "Finishing"),
    makeTip("tip-finishing-3", "Zug zum Korb", "Bei Euro Step Ball über Defender drüber (Donovan Mitchell)", "subcategory", "Finishing"),
    makeTip("tip-finishing-4", "Zug zum Korb", "Beim Pass schon in den Pass reinlaufen (Pascal Siakam)", "subcategory", "Finishing"),
    makeTip("tip-post-1", "Post Moves", "Tief anbieten, mit einem Move reinspringen und volle Power hoch", "game"),
    makeTip("tip-post-2", "Post Moves", "Mit tiefer Schulter und Ellbogen Space kreieren", "game"),
    makeTip("tip-post-3", "Post Moves", "Bei Help D Kick Out suchen", "game"),
    makeTip("tip-post-4", "Post Moves", "Wichtig: zum Korb, strong finishen, Rebound holen", "game"),
    makeTip("tip-system-1", "Systeme", "Kommunikation mit 2. Big: wer ist 5", "game"),
    makeTip("tip-system-2", "Systeme", "Bei 2 quick: Screen an der Dreierlinie", "game"),
    makeTip("tip-system-3", "Systeme", "Bei Horn zuerst D reindrücken, dann Screen stellen", "game"),
    makeTip("tip-screen-1", "Screens", "Screens stark und breit stellen, nicht bewegen", "game_training"),
    makeTip("tip-screen-2", "Screens", "Stark zum Korb rollen", "game_training"),
    makeTip("tip-floater-1", "Floater", "Zwei Beine -> hoher Floater -> zum Korb", "game_training"),
    makeTip("tip-defense-1", "Defense", "Welche Art von D spielen wir? Man-to-Man, Zone, Teilzone?", "game"),
    makeTip("tip-defense-2", "Defense", "Arme hoch, viel reden, auf Cuts achten, keine Fouls", "game"),
    makeTip("tip-defense-3", "Defense", "Erster in der Zone sein", "game"),
    makeTip("tip-vs-zone-1", "Gegen Zone", "Im Dunkerspot anbieten, Löcher ausnutzen, X-Spielzug", "game"),
    makeTip("tip-vs-zone-2", "Gegen Zone", "Beim Wurf direkt für Rebound bereit sein", "game"),
  ];
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
    return parsed;
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

    if (tip.scope === "subcategory") {
      if (normalizedSubcategory.length === 0) return false;
      return (tip.scopeValue ?? "").trim().toLowerCase() === normalizedSubcategory;
    }

    if (mode === "game") return tip.scope === "game";
    if (mode === "game_training") return tip.scope === "game_training";
    if (mode === "basketball_training") return tip.scope === "basketball_training";

    return false;
  });
}

/** Teilt gefilterte Tipps in „allgemeine“ (game / game_training / basketball_training) und nach Unterkategorie. */
export function partitionTipsForDisplay(filtered: PerformanceTip[]): {
  general: PerformanceTip[];
  bySubcategory: Map<string, PerformanceTip[]>;
} {
  const general: PerformanceTip[] = [];
  const bySubcategory = new Map<string, PerformanceTip[]>();
  for (const tip of filtered) {
    if (tip.scope === "subcategory") {
      const key = (tip.scopeValue ?? "Sonstiges").trim() || "Sonstiges";
      const list = bySubcategory.get(key) ?? [];
      list.push(tip);
      bySubcategory.set(key, list);
    } else {
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
