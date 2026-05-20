export type Category = "Basketball" | "Gym" | "Home" | "Regeneration";

export type Exercise = {
  id: string;
  name: string;
  durationMin: number;
  timeUnit?: "minutes" | "seconds";
  setCount?: number;
  category: Category;
  subcategory: string;
  notes?: string;
  /** Optional: Progressions-Schritte (sonst aus Übungsname abgeleitet). */
  progressionModality?: "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight";
  metricKeys: MetricKey[];
  targetByMetric?: Partial<Record<MetricKey, number>>;
  setTargetsByMetric?: Partial<Record<MetricKey, number>>[];
  distanceUnit?: "m" | "km";
  trackingType: "reps" | "weight";
  targetValue?: number;
  /** Optional URL zu einem Demo-/Drill-Video (YouTube, Vimeo etc.). */
  videoUrl?: string;
  /** Optional: empfohlene Pausenzeit in Sekunden zwischen Sätzen. */
  restSeconds?: number;
};

export type MetricKey =
  | "reps"
  | "weight"
  | "time"
  | "distance"
  | "makes"
  | "misses"
  | "points";

export type Workout = {
  id: string;
  name: string;
  category: Category;
  subcategory: string;
  notes?: string;
  level: number;
  exerciseIds: string[];
};

export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const categories: Category[] = ["Basketball", "Gym", "Home", "Regeneration"];

export const workoutSubcategoriesByCategory: Record<Category, string[]> = {
  Basketball: ["Handles", "Finishing", "Shooting", "Defense", "Footwork", "Passing", "Taktik", "Conditioning", "Spiel", "Komplett"],
  Gym: ["Oberkörper", "Arme", "Core", "Beine", "Cardio", "Komplett"],
  Home: ["Mobility", "Conditioning", "Recovery"],
  Regeneration: ["Meditation", "Mobilität & Dehnung", "Leichte Ausdauer"],
};

export const exerciseSubcategoriesByCategory: Record<Category, string[]> = {
  Basketball: ["Handles", "Finishing", "Shooting", "Defense", "Footwork", "Passing", "Taktik", "Conditioning"],
  Gym: ["Oberkörper", "Arme", "Core", "Beine", "Cardio"],
  Home: ["Mobility", "Conditioning", "Recovery"],
  Regeneration: ["Meditation", "Mobilität & Dehnung", "Leichte Ausdauer"],
};

export const defaultExercises: Exercise[] = [
  { id: "ex-0", name: "Pound Dribbles", durationMin: 10, category: "Basketball", subcategory: "Handles", notes: "Ball tief und schnell", metricKeys: ["reps", "time"], targetByMetric: { reps: 80, time: 60 }, trackingType: "reps", targetValue: 80, videoUrl: "https://www.youtube.com/results?search_query=pound+dribbles+drill", restSeconds: 30 },
  { id: "ex-1", name: "Cone Handles", durationMin: 12, category: "Basketball", subcategory: "Handles", notes: "Low and fast", metricKeys: ["reps", "time"], targetByMetric: { reps: 80, time: 60 }, trackingType: "reps", targetValue: 80, videoUrl: "https://www.youtube.com/results?search_query=cone+handles+drill", restSeconds: 45 },
  { id: "ex-10", name: "Cone Drills", durationMin: 10, category: "Basketball", subcategory: "Handles", notes: "Richtungswechsel", metricKeys: ["reps", "time"], targetByMetric: { reps: 40, time: 60 }, trackingType: "reps", targetValue: 40, videoUrl: "https://www.youtube.com/results?search_query=basketball+cone+drills", restSeconds: 60 },
  { id: "ex-2", name: "Mikan Finishes", durationMin: 12, category: "Basketball", subcategory: "Finishing", notes: "Beidseitig abschließen", metricKeys: ["reps", "makes"], targetByMetric: { reps: 80, makes: 60 }, trackingType: "reps", targetValue: 60, videoUrl: "https://www.youtube.com/results?search_query=mikan+drill", restSeconds: 30 },
  { id: "ex-3", name: "Shooting 1", durationMin: 18, category: "Basketball", subcategory: "Shooting", notes: "Nur swishes zählen", metricKeys: ["reps", "makes"], targetByMetric: { reps: 100, makes: 80 }, trackingType: "reps", targetValue: 80, videoUrl: "https://www.youtube.com/results?search_query=basketball+form+shooting", restSeconds: 30 },
  { id: "ex-4", name: "Shooting 2", durationMin: 20, category: "Basketball", subcategory: "Shooting", notes: "Spot-up 5 Spots", metricKeys: ["reps", "makes"], targetByMetric: { reps: 120, makes: 90 }, trackingType: "reps", targetValue: 90, videoUrl: "https://www.youtube.com/results?search_query=spot+up+shooting+drill", restSeconds: 45 },
  // Basketball – Handles (neu)
  { id: "ex-bh-11", name: "Two-Ball Pound", durationMin: 10, category: "Basketball", subcategory: "Handles", notes: "Beide Bälle gleichzeitig tief dribbeln", metricKeys: ["reps", "time"], targetByMetric: { reps: 60, time: 60 }, trackingType: "reps", targetValue: 60, videoUrl: "https://www.youtube.com/results?search_query=two+ball+pound+dribble", restSeconds: 30 },
  { id: "ex-bh-12", name: "In&Out Crossover Series", durationMin: 12, category: "Basketball", subcategory: "Handles", notes: "Schulter täuschen, schnelles Tempo", metricKeys: ["reps", "time"], targetByMetric: { reps: 50, time: 60 }, trackingType: "reps", targetValue: 50, videoUrl: "https://www.youtube.com/results?search_query=in+and+out+crossover+drill", restSeconds: 45 },
  { id: "ex-bh-13", name: "Spider Dribble", durationMin: 8, category: "Basketball", subcategory: "Handles", notes: "Tief in Squat-Position, Bein gewechselt", metricKeys: ["reps", "time"], targetByMetric: { reps: 50, time: 30 }, trackingType: "reps", targetValue: 50, restSeconds: 30 },
  // Basketball – Finishing (neu)
  { id: "ex-bf-21", name: "Reverse Layups", durationMin: 12, category: "Basketball", subcategory: "Finishing", notes: "Beidseitig, Schulter durch", metricKeys: ["reps", "makes"], targetByMetric: { reps: 40, makes: 30 }, trackingType: "reps", targetValue: 30, videoUrl: "https://www.youtube.com/results?search_query=reverse+layup+drill", restSeconds: 30 },
  { id: "ex-bf-22", name: "Floater Series", durationMin: 14, category: "Basketball", subcategory: "Finishing", notes: "Aus dem Lauf, beidhändig", metricKeys: ["reps", "makes"], targetByMetric: { reps: 60, makes: 36 }, trackingType: "reps", targetValue: 36, videoUrl: "https://www.youtube.com/results?search_query=floater+basketball+drill", restSeconds: 45 },
  { id: "ex-bf-23", name: "Euro Step Finish", durationMin: 12, category: "Basketball", subcategory: "Finishing", notes: "Schrittfolge betonen, Ball schützen", metricKeys: ["reps", "makes"], targetByMetric: { reps: 30, makes: 22 }, trackingType: "reps", targetValue: 22, videoUrl: "https://www.youtube.com/results?search_query=euro+step+drill", restSeconds: 45 },
  // Basketball – Shooting (neu)
  { id: "ex-bs-31", name: "Off-Dribble Pullup", durationMin: 18, category: "Basketball", subcategory: "Shooting", notes: "1-2 Dribbles, balanciert landen", metricKeys: ["reps", "makes"], targetByMetric: { reps: 60, makes: 40 }, trackingType: "reps", targetValue: 40, videoUrl: "https://www.youtube.com/results?search_query=off+the+dribble+pullup+drill", restSeconds: 45 },
  { id: "ex-bs-32", name: "Free Throws Cluster", durationMin: 10, category: "Basketball", subcategory: "Shooting", notes: "5er Cluster, Routine festigen", metricKeys: ["reps", "makes"], targetByMetric: { reps: 50, makes: 38 }, trackingType: "reps", targetValue: 38, videoUrl: "https://www.youtube.com/results?search_query=free+throw+routine", restSeconds: 20 },
  { id: "ex-bs-33", name: "Catch & Shoot 5 Spots", durationMin: 18, category: "Basketball", subcategory: "Shooting", notes: "Game-Speed, ohne Auflandung", metricKeys: ["reps", "makes"], targetByMetric: { reps: 75, makes: 50 }, trackingType: "reps", targetValue: 50, videoUrl: "https://www.youtube.com/results?search_query=catch+and+shoot+drill", restSeconds: 30 },
  // Basketball – Conditioning (neu)
  { id: "ex-bc-41", name: "Suicide Sprints", durationMin: 10, category: "Basketball", subcategory: "Conditioning", notes: "4 Linien, full intensity", metricKeys: ["reps", "time"], targetByMetric: { reps: 6, time: 6 }, trackingType: "reps", targetValue: 6, restSeconds: 90 },
  { id: "ex-bc-42", name: "Defensive Slides", durationMin: 8, category: "Basketball", subcategory: "Conditioning", notes: "Tief in Verteidigung, Hände aktiv", metricKeys: ["time", "reps"], targetByMetric: { time: 30, reps: 8 }, trackingType: "reps", targetValue: 8, restSeconds: 45 },
  // Basketball – Defense (neu)
  { id: "ex-bd-71", name: "Closeout Drill", durationMin: 10, category: "Basketball", subcategory: "Defense", notes: "Sprint zur Linie, dann kontrollierter Sliding-Closeout", metricKeys: ["reps", "time"], targetByMetric: { reps: 12, time: 8 }, trackingType: "reps", targetValue: 12, videoUrl: "https://www.youtube.com/results?search_query=basketball+closeout+drill", restSeconds: 45 },
  { id: "ex-bd-72", name: "Lane Slides + Recovery", durationMin: 10, category: "Basketball", subcategory: "Defense", notes: "Tief, Hände aktiv, schnelle Recovery", metricKeys: ["reps", "time"], targetByMetric: { reps: 8, time: 6 }, trackingType: "reps", targetValue: 8, videoUrl: "https://www.youtube.com/results?search_query=defensive+slide+drill", restSeconds: 60 },
  { id: "ex-bd-73", name: "Mirror Defense (Reaktion)", durationMin: 8, category: "Basketball", subcategory: "Defense", notes: "Mit Partner: schnelle Reaktion auf Richtungswechsel", metricKeys: ["time", "reps"], targetByMetric: { time: 6, reps: 8 }, trackingType: "reps", targetValue: 6, restSeconds: 45 },
  // Basketball – Footwork (neu)
  { id: "ex-bft-81", name: "Pivot Series", durationMin: 8, category: "Basketball", subcategory: "Footwork", notes: "Front- & Reverse-Pivots, Ball schützen", metricKeys: ["reps", "time"], targetByMetric: { reps: 30, time: 5 }, trackingType: "reps", targetValue: 30, videoUrl: "https://www.youtube.com/results?search_query=basketball+pivot+drill", restSeconds: 30 },
  { id: "ex-bft-82", name: "Jab Step Sequence", durationMin: 10, category: "Basketball", subcategory: "Footwork", notes: "Jab → Drive / Pull-Up / Pass entscheiden", metricKeys: ["reps", "time"], targetByMetric: { reps: 20, time: 8 }, trackingType: "reps", targetValue: 20, videoUrl: "https://www.youtube.com/results?search_query=jab+step+drill", restSeconds: 45 },
  // Basketball – Passing (neu)
  { id: "ex-bp-91", name: "Wall Passing", durationMin: 8, category: "Basketball", subcategory: "Passing", notes: "Bounce + Chest, beidhändig, Tempo halten", metricKeys: ["reps", "time"], targetByMetric: { reps: 80, time: 5 }, trackingType: "reps", targetValue: 80, videoUrl: "https://www.youtube.com/results?search_query=wall+passing+drill", restSeconds: 30 },
  { id: "ex-bp-92", name: "Pick-and-Roll Reads", durationMin: 14, category: "Basketball", subcategory: "Passing", notes: "Pocket / Lob / Skip-Pass entscheiden", metricKeys: ["reps", "time"], targetByMetric: { reps: 18, time: 7 }, trackingType: "reps", targetValue: 18, videoUrl: "https://www.youtube.com/results?search_query=pick+and+roll+passing+reads", restSeconds: 60 },
  // Basketball – Taktik (neu)
  { id: "ex-bt-101", name: "Read & React (Solo)", durationMin: 14, category: "Basketball", subcategory: "Taktik", notes: "Spot-Up, Cut, Drift simulieren — 5 Phasen", metricKeys: ["reps", "time"], targetByMetric: { reps: 15, time: 7 }, trackingType: "reps", targetValue: 15, restSeconds: 30 },
  { id: "ex-bt-102", name: "P&R Decision-Making (Film)", durationMin: 12, category: "Basketball", subcategory: "Taktik", notes: "Video-Reps: Lese Hedge/Drop/Switch, eigene Lösung notieren", metricKeys: ["time", "reps"], targetByMetric: { time: 12, reps: 6 }, trackingType: "reps", targetValue: 12, videoUrl: "https://www.youtube.com/results?search_query=pick+and+roll+coverages+breakdown" },
  { id: "ex-bt-103", name: "Conceptual Walk-Through", durationMin: 10, category: "Basketball", subcategory: "Taktik", notes: "Set-Plays / Spacing-Konzepte mental durchgehen", metricKeys: ["time"], targetByMetric: { time: 10 }, trackingType: "reps", targetValue: 10 },
  // Gym – Oberkörper / Arme / Beine (neu + bestehende)
  { id: "ex-5", name: "Bench Press", durationMin: 15, category: "Gym", subcategory: "Oberkörper", notes: "Kontrollierte Exzentrik", progressionModality: "barbell", metricKeys: ["weight", "reps"], targetByMetric: { weight: 70, reps: 8 }, trackingType: "weight", targetValue: 70, videoUrl: "https://www.youtube.com/results?search_query=bench+press+form", restSeconds: 120 },
  { id: "ex-6", name: "Barbell Row", durationMin: 15, category: "Gym", subcategory: "Arme", notes: "Schulterblätter aktiv", progressionModality: "barbell", metricKeys: ["weight", "reps"], targetByMetric: { weight: 60, reps: 10 }, trackingType: "weight", targetValue: 60, videoUrl: "https://www.youtube.com/results?search_query=barbell+row+form", restSeconds: 120 },
  { id: "ex-7", name: "Back Squat", durationMin: 18, category: "Gym", subcategory: "Beine", notes: "Tiefe sauber halten", progressionModality: "barbell", metricKeys: ["weight", "reps"], targetByMetric: { weight: 90, reps: 6 }, trackingType: "weight", targetValue: 90, videoUrl: "https://www.youtube.com/results?search_query=back+squat+form", restSeconds: 180 },
  { id: "ex-8", name: "Cable Crunch", durationMin: 10, category: "Gym", subcategory: "Core", notes: "Rumpfspannung", progressionModality: "cable", metricKeys: ["weight", "reps"], targetByMetric: { weight: 35, reps: 15 }, trackingType: "weight", targetValue: 35, videoUrl: "https://www.youtube.com/results?search_query=cable+crunch+form", restSeconds: 60 },
  { id: "ex-g-51", name: "Pull Ups", durationMin: 10, category: "Gym", subcategory: "Arme", notes: "Volle ROM, kein Schwung", progressionModality: "bodyweight", metricKeys: ["reps", "weight"], targetByMetric: { reps: 8, weight: 0 }, trackingType: "reps", targetValue: 8, videoUrl: "https://www.youtube.com/results?search_query=pull+up+form", restSeconds: 120 },
  { id: "ex-g-52", name: "Romanian Deadlift", durationMin: 15, category: "Gym", subcategory: "Beine", notes: "Hüfte schieben, Beine leicht gebeugt", progressionModality: "barbell", metricKeys: ["weight", "reps"], targetByMetric: { weight: 70, reps: 8 }, trackingType: "weight", targetValue: 70, videoUrl: "https://www.youtube.com/results?search_query=romanian+deadlift+form", restSeconds: 150 },
  { id: "ex-g-53", name: "Overhead Press", durationMin: 12, category: "Gym", subcategory: "Oberkörper", notes: "Glutes anspannen, Core fest", progressionModality: "barbell", metricKeys: ["weight", "reps"], targetByMetric: { weight: 45, reps: 6 }, trackingType: "weight", targetValue: 45, videoUrl: "https://www.youtube.com/results?search_query=overhead+press+form", restSeconds: 120 },
  { id: "ex-g-54", name: "Bulgarian Split Squat", durationMin: 12, category: "Gym", subcategory: "Beine", notes: "Knee tracking, kontrollierte Exzentrik", progressionModality: "dumbbell", metricKeys: ["weight", "reps"], targetByMetric: { weight: 16, reps: 10 }, trackingType: "weight", targetValue: 16, videoUrl: "https://www.youtube.com/results?search_query=bulgarian+split+squat", restSeconds: 90 },
  { id: "ex-g-55", name: "Plank Walkout", durationMin: 8, category: "Gym", subcategory: "Core", notes: "Schulter über Handgelenk", progressionModality: "bodyweight", metricKeys: ["reps", "time"], targetByMetric: { reps: 10, time: 60 }, trackingType: "reps", targetValue: 10, videoUrl: "https://www.youtube.com/results?search_query=plank+walkout", restSeconds: 45 },
  // Home
  { id: "ex-9", name: "Dead Bug", durationMin: 10, category: "Home", subcategory: "Recovery", notes: "Langsam und kontrolliert", metricKeys: ["reps", "time"], targetByMetric: { reps: 20, time: 45 }, trackingType: "reps", targetValue: 20, videoUrl: "https://www.youtube.com/results?search_query=dead+bug+exercise", restSeconds: 30 },
  { id: "ex-h-61", name: "Wall Sit", durationMin: 5, category: "Home", subcategory: "Conditioning", notes: "Hüfte parallel, halten", metricKeys: ["time"], targetByMetric: { time: 60 }, trackingType: "reps", targetValue: 60, videoUrl: "https://www.youtube.com/results?search_query=wall+sit", restSeconds: 60 },
  { id: "ex-h-62", name: "Mountain Climbers", durationMin: 6, category: "Home", subcategory: "Conditioning", notes: "Schnell und kontrolliert", metricKeys: ["reps", "time"], targetByMetric: { reps: 40, time: 30 }, trackingType: "reps", targetValue: 40, videoUrl: "https://www.youtube.com/results?search_query=mountain+climbers", restSeconds: 45 },
  { id: "ex-h-63", name: "Couch Stretch", durationMin: 6, category: "Home", subcategory: "Mobility", notes: "Hüftbeuger öffnen, je Seite", metricKeys: ["time"], targetByMetric: { time: 90 }, trackingType: "reps", targetValue: 90, videoUrl: "https://www.youtube.com/results?search_query=couch+stretch", restSeconds: 0 },
  // Regeneration
  { id: "ex-regen-1", name: "Box Breathing", durationMin: 8, category: "Regeneration", subcategory: "Meditation", notes: "4-4-4-4 Atmung", metricKeys: ["time"], targetByMetric: { time: 8 }, trackingType: "reps", targetValue: 8, videoUrl: "https://www.youtube.com/results?search_query=box+breathing+technique" },
  { id: "ex-regen-2", name: "Hip Mobility Flow", durationMin: 12, category: "Regeneration", subcategory: "Mobilität & Dehnung", notes: "Ruhig und kontrolliert", metricKeys: ["time"], targetByMetric: { time: 12 }, trackingType: "reps", targetValue: 12, videoUrl: "https://www.youtube.com/results?search_query=hip+mobility+flow" },
  { id: "ex-regen-3", name: "Zone-2 Walk", durationMin: 20, category: "Regeneration", subcategory: "Leichte Ausdauer", notes: "Niedrige Belastung", metricKeys: ["time", "distance"], targetByMetric: { time: 20, distance: 2 }, trackingType: "reps", targetValue: 20 },
  { id: "ex-regen-4", name: "Foam Rolling Beine", durationMin: 10, category: "Regeneration", subcategory: "Mobilität & Dehnung", notes: "Schwer-zugängliche Trigger 30s halten", metricKeys: ["time"], targetByMetric: { time: 10 }, trackingType: "reps", targetValue: 10, videoUrl: "https://www.youtube.com/results?search_query=foam+rolling+legs" },
  { id: "ex-regen-5", name: "Shoulder CARs", durationMin: 8, category: "Regeneration", subcategory: "Mobilität & Dehnung", notes: "Vollständige Schulter-Kreise je Seite", metricKeys: ["reps", "time"], targetByMetric: { reps: 10, time: 8 }, trackingType: "reps", targetValue: 10, videoUrl: "https://www.youtube.com/results?search_query=shoulder+CARs+mobility" },
];

export const defaultWorkouts: Workout[] = [
  { id: "wo-game-day", name: "Spieltag", category: "Basketball", subcategory: "Spiel", notes: "Box Score tracken: Minuten, Punkte, Intensität und Notizen.", level: 1, exerciseIds: [] },
  { id: "wo-training-game", name: "Trainingsspiel", category: "Basketball", subcategory: "Spiel", notes: "Trainingsspiel tracken: Minuten, Punkte, Intensität und Notizen.", level: 1, exerciseIds: [] },
  { id: "wo-0", name: "Ballhandling Flow", category: "Basketball", subcategory: "Handles", notes: "Handle-Fokus vor Teamtraining", level: 1, exerciseIds: ["ex-0", "ex-10"] },
  { id: "wo-1", name: "Shooting 1", category: "Basketball", subcategory: "Shooting", notes: "Fokus Catch&Shoot", level: 1, exerciseIds: ["ex-3"] },
  { id: "wo-2", name: "Shooting 2", category: "Basketball", subcategory: "Shooting", notes: "Mehr Volumen", level: 2, exerciseIds: ["ex-3", "ex-4"] },
  { id: "wo-3", name: "Shooting 3", category: "Basketball", subcategory: "Shooting", notes: "Game-Speed", level: 3, exerciseIds: ["ex-4"] },
  { id: "wo-4", name: "Gym Oberkörper 1", category: "Gym", subcategory: "Oberkörper", notes: "Saubere Technik", level: 1, exerciseIds: ["ex-5"] },
  { id: "wo-5", name: "Gym Arme 1", category: "Gym", subcategory: "Arme", notes: "Rücken aktiv", level: 1, exerciseIds: ["ex-6"] },
  { id: "wo-6", name: "Gym Beine 1", category: "Gym", subcategory: "Beine", notes: "Tiefe priorisieren", level: 1, exerciseIds: ["ex-7"] },
  { id: "wo-7", name: "Gym Core 1", category: "Gym", subcategory: "Core", notes: "Rumpfspannung", level: 1, exerciseIds: ["ex-8"] },
  { id: "wo-regen-1", name: "Regeneration Atemfokus", category: "Regeneration", subcategory: "Meditation", notes: "Nach intensiven Tagen", level: 1, exerciseIds: ["ex-regen-1"] },
  { id: "wo-regen-2", name: "Regeneration Mobility", category: "Regeneration", subcategory: "Mobilität & Dehnung", notes: "Beweglichkeit", level: 1, exerciseIds: ["ex-regen-2"] },
  { id: "wo-regen-3", name: "Regeneration Cardio Light", category: "Regeneration", subcategory: "Leichte Ausdauer", notes: "Lockere Durchblutung", level: 1, exerciseIds: ["ex-regen-3"] },
];

export function getWorkoutById(workoutId: string) {
  return defaultWorkouts.find((workout) => workout.id === workoutId);
}

export function getTodayWeekdayKey(date = new Date()): WeekdayKey {
  const day = date.getDay();
  const map: Record<number, WeekdayKey> = {
    0: "sunday",
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday",
  };

  return map[day];
}