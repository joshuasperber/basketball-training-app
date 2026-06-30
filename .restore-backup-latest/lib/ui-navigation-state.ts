export type TrainingTab = "Workouts" | "Exercises";
export type LigaTab = "schedule" | "opponents" | "season";
export type TeamDetailTab = "overview" | "roster" | "scouting" | "advice";

const UI_NAV_STATE_KEY = "bt.ui-navigation.v1";

type UiNavigationState = {
  trainingTab?: TrainingTab;
  ligaTab?: LigaTab;
  teamDetailTab?: TeamDetailTab;
};

function readState(): UiNavigationState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(UI_NAV_STATE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as UiNavigationState;
  } catch {
    return {};
  }
}

function writeState(patch: Partial<UiNavigationState>) {
  if (typeof window === "undefined") return;
  const next = { ...readState(), ...patch };
  window.localStorage.setItem(UI_NAV_STATE_KEY, JSON.stringify(next));
}

export function getTrainingTabFromParam(param: string | null | undefined): TrainingTab | null {
  if (!param) return null;
  const normalized = param.trim().toLowerCase();
  if (normalized === "exercises" || normalized === "exercise") return "Exercises";
  if (normalized === "workouts" || normalized === "workout") return "Workouts";
  if (param === "Exercises" || param === "Workouts") return param;
  return null;
}

export function loadTrainingTab(): TrainingTab | null {
  return readState().trainingTab ?? null;
}

export function persistTrainingTab(tab: TrainingTab) {
  writeState({ trainingTab: tab });
}

export function loadLigaTab(): LigaTab | null {
  return readState().ligaTab ?? null;
}

export function persistLigaTab(tab: LigaTab) {
  writeState({ ligaTab: tab });
}

export function loadTeamDetailTab(): TeamDetailTab | null {
  return readState().teamDetailTab ?? null;
}

export function persistTeamDetailTab(tab: TeamDetailTab) {
  writeState({ teamDetailTab: tab });
}

export function appendQueryParams(path: string, params: Record<string, string | undefined | null>) {
  const [basePath, existingQuery = ""] = path.split("?");
  const search = new URLSearchParams(existingQuery);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    search.set(key, value);
  }
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function buildTrainingHref(tab: TrainingTab, query?: Record<string, string | undefined | null>) {
  return appendQueryParams("/training", { tab, ...query });
}

export function buildReturnToTraining(tab: TrainingTab) {
  return buildTrainingHref(tab);
}

export function resolveReturnTo(param: string | null | undefined, fallback: string) {
  if (!param) return fallback;
  try {
    const decoded = decodeURIComponent(param);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) {
      return decoded;
    }
  } catch {
    // ignore malformed values
  }
  return fallback;
}

export function buildReturnToQuery(returnTo: string) {
  return encodeURIComponent(returnTo);
}
