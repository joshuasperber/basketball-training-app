"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getStoredLocale,
  LOCALE_UPDATED_EVENT,
  setStoredLocale,
  type AppLocale,
} from "@/lib/i18n/locale";
import { translate, type MessageKey } from "@/lib/i18n/messages";

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("de");

  useEffect(() => {
    setLocaleState(getStoredLocale());
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ locale?: AppLocale }>).detail;
      if (detail?.locale) setLocaleState(detail.locale);
      else setLocaleState(getStoredLocale());
    };
    window.addEventListener(LOCALE_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(LOCALE_UPDATED_EVENT, onUpdate);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: AppLocale) => {
    setStoredLocale(next);
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      locale: "de" as AppLocale,
      setLocale: () => undefined,
      t: (key: MessageKey, vars?: Record<string, string | number>) => translate("de", key, vars),
    };
  }
  return ctx;
}

export function useT() {
  return useI18n().t;
}
