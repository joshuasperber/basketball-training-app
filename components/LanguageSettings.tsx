"use client";

import { LOCALES, LOCALE_LABELS, type AppLocale } from "@/lib/i18n/locale";
import { useI18n } from "@/lib/i18n/I18nProvider";

export default function LanguageSettings() {
  const { locale, setLocale, t } = useI18n();

  return (
    <section className="app-card">
      <p className="section-eyebrow">{t("settings.language")}</p>
      <h2 className="section-title mt-1">{t("settings.languageTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("settings.languageHint")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            className={`btn btn-sm ${locale === code ? "btn-primary" : "btn-ghost"}`}
            aria-pressed={locale === code}
            onClick={() => setLocale(code as AppLocale)}
          >
            {LOCALE_LABELS[code]}
          </button>
        ))}
      </div>
    </section>
  );
}
