export type WorkoutPlan = {
  category: "basketball" | "gym" | "home";
  title: string;
  focus: string;
  durationMin: number;
  exercises: string[];
};

export const weeklyPlan: Record<string, WorkoutPlan> = {
  monday: {
    category: "basketball",
    title: "Shooting 1",
    focus: "Form + Catch & Shoot",
    durationMin: 45,
    exercises: ["Form Shooting", "Catch and Shoot", "Mikan Drill"],
  },
  tuesday: {
    category: "gym",
    title: "Push 1",
    focus: "Brust / Schulter / Trizeps",
    durationMin: 50,
    exercises: ["Bench Press", "Overhead Press", "Push-ups"],
  },
  wednesday: {
    category: "basketball",
    title: "Handles 1",
    focus: "Ball Handling + First Step",
    durationMin: 40,
    exercises: ["Cone Dribbling", "Two-Ball Dribble", "Change of Pace"],
  },
  thursday: {
    category: "gym",
    title: "Pull 2",
    focus: "Rücken / Bizeps",
    durationMin: 50,
    exercises: ["Lat Pulldown", "Seated Row", "Biceps Curl"],
  },
  friday: {
    category: "basketball",
    title: "Shooting 3",
    focus: "Game-Speed Shooting",
    durationMin: 55,
    exercises: ["Catch and Shoot", "Off Dribble Pull-Up", "Corner Threes"],
  },
  saturday: {
    category: "home",
    title: "Mobility + Core",
    focus: "Recovery + Stabilität",
    durationMin: 30,
    exercises: ["Hip Mobility", "Plank Series", "Breathing"],
  },
  sunday: {
    category: "home",
    title: "Active Recovery",
    focus: "Leichtes Movement + Stretching",
    durationMin: 25,
    exercises: ["Walk", "Stretch Routine", "Foam Rolling"],
  },
};

const dayMap = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function getTodayKey() {
  return dayMap[new Date().getDay()];
}

export function getTodayWorkout() {
  return weeklyPlan[getTodayKey()];
}