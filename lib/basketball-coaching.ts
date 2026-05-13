import type { WorkoutSessionEntry } from "@/lib/session-storage";
import { loadExercises } from "@/lib/training-storage";

export type CoachingRecommendation = {
  id: string;
  title: string;
  detail: string;
};

type ShotBucket = { made: number; attempts: number };

function aggregateShots(sessions: WorkoutSessionEntry[], daysBack: number): {
  ft: ShotBucket;
  three: ShotBucket;
  two: ShotBucket;
} {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - daysBack);

  const exercises = loadExercises();
  const exerciseLookup = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  const summary = {
    ft: { made: 0, attempts: 0 },
    three: { made: 0, attempts: 0 },
    two: { made: 0, attempts: 0 },
  };

  sessions.forEach((session) => {
    if (new Date(session.dateISO) < cutoff) return;
    session.logs.forEach((log) => {
      const exercise = exerciseLookup.get(log.exerciseId);
      if (!exercise || exercise.category !== "Basketball") return;
      const attempts = Math.max(0, log.attempts ?? ((log.made ?? 0) + (log.misses ?? 0)));
      const made = Math.max(0, log.made ?? 0);
      if (attempts <= 0) return;
      const name = exercise.name.toLowerCase();
      if (name.includes("freiwurf") || name.includes("free throw")) {
        summary.ft.attempts += attempts;
        summary.ft.made += made;
      } else if (name.includes("3 pointer") || name.includes("3-pointer") || name.includes("3pt")) {
        summary.three.attempts += attempts;
        summary.three.made += made;
      } else if (exercise.subcategory === "Shooting" || exercise.subcategory === "Finishing") {
        summary.two.attempts += attempts;
        summary.two.made += made;
      }
    });
  });

  return summary;
}

function quote(bucket: ShotBucket) {
  if (bucket.attempts <= 0) return null;
  return bucket.made / bucket.attempts;
}

const BIGS = new Set(["pf", "c"]);

export function buildBasketballCoachingPlan(input: {
  sessions: WorkoutSessionEntry[];
  position: string;
  playStyle: string;
  level: number;
}) {
  const daysBack = input.level >= 8 ? 21 : input.level >= 4 ? 28 : 35;
  const shots = aggregateShots(input.sessions, daysBack);

  const ftQ = quote(shots.ft);
  const threeQ = quote(shots.three);
  const twoQ = quote(shots.two);

  const pos = input.position.trim().toLowerCase();
  const isBig = BIGS.has(pos);
  const style = input.playStyle.toLowerCase();

  const prioritizedSubcategories: string[] = [];
  const recommendations: CoachingRecommendation[] = [];

  const pushCat = (cat: string) => {
    if (!prioritizedSubcategories.includes(cat)) prioritizedSubcategories.push(cat);
  };

  if (shots.ft.attempts >= 10 && ftQ !== null && ftQ < 0.7) {
    pushCat("Shooting");
    recommendations.push({
      id: "ft-low",
      title: "Freiwurf fokussieren",
      detail: `Freiwurf-Quote ca. ${Math.round(ftQ * 100)} % (${shots.ft.made}/${shots.ft.attempts}) — mehr FT-Volumen und Technik-Sessions einplanen.`,
    });
  }

  if (shots.three.attempts >= 18 && threeQ !== null && threeQ < 0.33) {
    if (isBig && (style.includes("post") || style.includes("finisher") || style.includes("rim"))) {
      pushCat("Finishing");
      pushCat("Komplett");
      recommendations.push({
        id: "three-big-athletic",
        title: "Dreier zweitrangig",
        detail:
          "3er-Quote im Keller, du bist groß/athletisch im Frontcourt — Finishing und Kontakt-Abschlüsse priorisieren; Dreier nur als Ergänzung pflegen.",
      });
    } else {
      pushCat("Shooting");
      recommendations.push({
        id: "three-general",
        title: "Dreier stabilisieren",
        detail: `3PT-Quote ca. ${Math.round(threeQ * 100)} % — mehr Spot-Up/Footwork-Wiederholungen.`,
      });
    }
  }

  if (shots.two.attempts >= 22 && twoQ !== null && twoQ < 0.47) {
    pushCat("Finishing");
    recommendations.push({
      id: "two-low",
      title: "Abschluss unter Druck",
      detail: `2PT/Finishing-Bucket unter Zielquote (${Math.round(twoQ * 100)} %) — Mikan, Floaters und Kontakt-Footwork erhöhen.`,
    });
  }

  if (input.level <= 3 && prioritizedSubcategories.length === 0) {
    pushCat("Handles");
    recommendations.push({
      id: "lvl-foundation",
      title: "Basis-Fahrplan",
      detail: "Noch wenig Wurf-Daten — Grundlagen: Ballhandling und einfache Finishes gleichmäßig trainieren.",
    });
  }

  if (prioritizedSubcategories.length === 0) {
    pushCat("Conditioning");
    recommendations.push({
      id: "balanced",
      title: "Ausgewogen weiterarbeiten",
      detail: "Keine klaren Schwächen im Fenster — Conditioning und Komplett-Sessions für Transfer.",
    });
  }

  return {
    prioritizedSubcategories,
    recommendations,
    windowDays: daysBack,
    shots,
    ftQ,
    threeQ,
    twoQ,
  };
}

export function buildBasketballCoachingPriorities(sessions: WorkoutSessionEntry[], position: string, playStyle: string, level: number) {
  return buildBasketballCoachingPlan({ sessions, position, playStyle, level }).prioritizedSubcategories;
}
