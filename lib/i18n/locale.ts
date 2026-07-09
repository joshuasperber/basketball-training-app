export type AppLocale = "de" | "en";

export const LOCALE_STORAGE_KEY = "bt.locale.v1";
export const LOCALE_UPDATED_EVENT = "bt:locale-updated";

export const LOCALES: AppLocale[] = ["de", "en"];

export const LOCALE_LABELS: Record<AppLocale, string> = {
  de: "Deutsch",
  en: "English",
};

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "de" || value === "en";
}

export function getStoredLocale(): AppLocale {
  if (typeof window === "undefined") return "de";
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isAppLocale(raw) ? raw : "de";
  } catch {
    return "de";
  }
}

export function setStoredLocale(locale: AppLocale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  window.dispatchEvent(new CustomEvent(LOCALE_UPDATED_EVENT, { detail: { locale } }));
}
