import type { AppLocale } from "@/lib/i18n/locale";

export type MessageKey = keyof typeof de;

const de = {
  "nav.home": "Start",
  "nav.training": "Training",
  "nav.team": "Team",
  "nav.stats": "Stats",
  "nav.profile": "Profil",
  "nav.aria": "Hauptnavigation",

  "tabs.week": "Woche",
  "tabs.catalog": "Katalog",
  "tabs.stats": "Stats",
  "tabs.level": "Level",
  "tabs.review": "Review",
  "tabs.team": "Team",
  "tabs.liga": "Liga",

  "settings.title": "Einstellungen",
  "settings.description": "Sprache, Reminder, Coach und weitere App-Optionen.",
  "settings.language": "Sprache",
  "settings.languageTitle": "App-Sprache",
  "settings.languageHint": "Wähle Deutsch oder English. Die Einstellung gilt auf diesem Gerät.",
  "settings.coach": "Coach",
  "settings.coachChat": "Kennenlern-Chat",
  "settings.coachChatHint":
    "Setzt Stärken, Schwächen und Rolle zurück — der Dialog erscheint beim nächsten App-Start erneut.",
  "settings.coachChatReset": "Kennenlern-Chat erneut starten",
  "settings.coachChatResetOk": "Kennenlern-Chat zurückgesetzt.",
  "settings.app": "App",
  "settings.homeScreen": "Zum Home-Bildschirm",
  "settings.session": "Session",
  "settings.logout": "Abmelden",
  "settings.logoutHint": "Speichert deine Daten in der Cloud und beendet die Anmeldung auf diesem Gerät.",
  "settings.loggingOut": "Abmelden …",
  "settings.savingData": "Daten werden gespeichert …",
  "settings.savingDataSub": "Dein Fortschritt wird in der Cloud gesichert.",
  "settings.endingSession": "Session wird beendet.",
  "settings.logoutFailed": "Abmelden fehlgeschlagen. Bitte erneut versuchen.",

  "privacy.title": "Deine Daten",
  "privacy.eyebrow": "Datenschutz",
  "privacy.hint":
    "Export (Art. 20 DSGVO) oder Löschung von Cloud-Konto und lokalen Browser-Daten. Nach Löschung können technische Log-Einträge bei Dienstleistern (z. B. Sentry) kurzzeitig verbleiben.",
  "privacy.export": "Alle Daten exportieren (JSON)",
  "privacy.delete": "Konto & Cloud-Daten löschen",
  "privacy.deleteTitle": "Konto löschen",
  "privacy.deleteMessage":
    "Konto und alle Cloud-Daten unwiderruflich löschen? Lokale Browser-Daten werden ebenfalls geleert.",
  "privacy.deleteContinue": "Weiter",
  "privacy.deleteCancel": "Abbrechen",
  "privacy.deleteFinalTitle": "Letzte Bestätigung",
  "privacy.deleteFinalMessage": "Wirklich endgültig löschen? Dieser Schritt kann nicht rückgängig gemacht werden.",
  "privacy.deleteConfirm": "Endgültig löschen",
  "privacy.deleteAborted": "Löschung abgebrochen.",
  "privacy.linkPrivacy": "Datenschutzerklärung",
  "privacy.linkTerms": "Nutzungsbedingungen",
  "privacy.linkImprint": "Impressum",

  "ai.consentTitle": "KI-Coach",
  "ai.consentHint": "Profil- und Trainingsdaten können an Groq/OpenAI übermittelt werden.",
  "ai.consentDetails": "Details",
  "ai.consentLabel": "KI-Coach-Empfehlungen erlauben",
  "ai.enabled": "KI-Coach aktiviert.",
  "ai.disabled": "KI-Coach deaktiviert. Es werden keine neuen KI-Anfragen gestellt.",
  "ai.saveFailed": "Einstellung konnte nicht gespeichert werden.",

  "analytics.consentTitle": "Fehlerberichte (Sentry)",
  "analytics.consentHint": "Optional anonymisierte Diagnostik.",
  "analytics.consentLabel": "Fehler- und Performance-Berichte erlauben",
  "analytics.enabled": "Fehlerberichte (Sentry) aktiviert.",
  "analytics.disabled": "Fehlerberichte (Sentry) deaktiviert.",

  "cookie.title": "Datenschutz & Diagnostik",
  "cookie.body":
    "Session-Cookies sind für die Anmeldung erforderlich. Optional können anonymisierte Fehler- und Performance-Berichte an Sentry gesendet werden — nur mit deiner Einwilligung. Details in der",
  "cookie.privacyLink": "Datenschutzerklärung",
  "cookie.accept": "Akzeptieren",
  "cookie.decline": "Ablehnen",

  "sync.title": "Sync-Konflikt",
  "sync.body":
    "Die Cloud-Version ist neuer als dein letzter Sync. Bitte wähle, welche Version gelten soll — sonst können Änderungen verloren gehen.",
  "sync.useCloud": "Cloud übernehmen",
  "sync.keepLocal": "Lokal behalten",
  "sync.keepLocalFailed": "Lokale Version konnte nicht in die Cloud geschrieben werden. Bitte erneut versuchen.",
  "sync.networkError": "Netzwerkfehler beim Speichern. Bitte erneut versuchen.",

  "offline.banner": "Offline — Änderungen werden lokal gespeichert und beim nächsten Online-Status synchronisiert.",
  "common.close": "Schließen",
  "common.cancel": "Abbrechen",
  "common.save": "Speichern",
  "common.continue": "Weiter",
  "common.later": "Später",
  "common.loading": "Laden …",
  "common.error": "Etwas ist schiefgelaufen",
  "common.retry": "Erneut versuchen",
  "common.details": "Details",

  "login.eyebrow": "Willkommen zurück",
  "login.title": "Anmelden",
  "login.password": "Passwort",
  "login.otp": "E-Mail-Code",
  "login.passwordHint": "E-Mail + Passwort — danach direkt in die App. Neu hier? „Konto anlegen“.",
  "login.otpHint": "Alternativ: 8-stelliger Code per E-Mail (ohne Passwort).",
  "login.email": "E-Mail",
  "login.emailPlaceholder": "name@beispiel.de",
  "login.forgotPassword": "Passwort vergessen?",
  "login.signIn": "Anmelden",
  "login.signingIn": "Anmelden…",
  "login.createAccount": "Konto anlegen (Passwort)",
  "login.legalCheckbox":
    "Ich bin mindestens 16 Jahre alt, akzeptiere die Nutzungsbedingungen und habe die Datenschutzerklärung gelesen (für „Konto anlegen“ erforderlich).",
  "login.legalCheckboxOtp":
    "Ich bin mindestens 16 Jahre alt, akzeptiere die Nutzungsbedingungen und habe die Datenschutzerklärung gelesen (erforderlich für Code-Anmeldung / neues Konto).",
  "login.terms": "Nutzungsbedingungen",
  "login.privacy": "Datenschutzerklärung",
  "login.requestCode": "Code anfordern",
  "login.sending": "Sende…",
  "login.verifyCode": "Code bestätigen",
  "login.checking": "Prüfe…",
  "login.otherEmail": "Andere E-Mail verwenden",
  "login.codeLabel": "Bestätigungscode",
  "login.legalRequired":
    "Bitte Nutzungsbedingungen und Datenschutz bestätigen sowie das Mindestalter von 16 Jahren.",

  "profile.settings": "Einstellungen",
} as const;

const en: Record<MessageKey, string> = {
  "nav.home": "Home",
  "nav.training": "Training",
  "nav.team": "Team",
  "nav.stats": "Stats",
  "nav.profile": "Profile",
  "nav.aria": "Main navigation",

  "tabs.week": "Week",
  "tabs.catalog": "Catalog",
  "tabs.stats": "Stats",
  "tabs.level": "Level",
  "tabs.review": "Review",
  "tabs.team": "Team",
  "tabs.liga": "League",

  "settings.title": "Settings",
  "settings.description": "Language, reminders, coach, and other app options.",
  "settings.language": "Language",
  "settings.languageTitle": "App language",
  "settings.languageHint": "Choose German or English. This setting applies on this device.",
  "settings.coach": "Coach",
  "settings.coachChat": "Intro chat",
  "settings.coachChatHint":
    "Resets strengths, weaknesses, and role — the dialog will appear again on the next app start.",
  "settings.coachChatReset": "Restart intro chat",
  "settings.coachChatResetOk": "Intro chat reset.",
  "settings.app": "App",
  "settings.homeScreen": "Add to Home Screen",
  "settings.session": "Session",
  "settings.logout": "Log out",
  "settings.logoutHint": "Saves your data to the cloud and ends the session on this device.",
  "settings.loggingOut": "Logging out…",
  "settings.savingData": "Saving data…",
  "settings.savingDataSub": "Your progress is being saved to the cloud.",
  "settings.endingSession": "Ending session.",
  "settings.logoutFailed": "Log out failed. Please try again.",

  "privacy.title": "Your data",
  "privacy.eyebrow": "Privacy",
  "privacy.hint":
    "Export (GDPR Art. 20) or delete your cloud account and local browser data. After deletion, technical logs at providers (e.g. Sentry) may remain briefly.",
  "privacy.export": "Export all data (JSON)",
  "privacy.delete": "Delete account & cloud data",
  "privacy.deleteTitle": "Delete account",
  "privacy.deleteMessage":
    "Permanently delete account and all cloud data? Local browser data will also be cleared.",
  "privacy.deleteContinue": "Continue",
  "privacy.deleteCancel": "Cancel",
  "privacy.deleteFinalTitle": "Final confirmation",
  "privacy.deleteFinalMessage": "Really delete permanently? This cannot be undone.",
  "privacy.deleteConfirm": "Delete permanently",
  "privacy.deleteAborted": "Deletion cancelled.",
  "privacy.linkPrivacy": "Privacy policy",
  "privacy.linkTerms": "Terms of use",
  "privacy.linkImprint": "Legal notice",

  "ai.consentTitle": "AI coach",
  "ai.consentHint": "Profile and training data may be sent to Groq/OpenAI.",
  "ai.consentDetails": "Details",
  "ai.consentLabel": "Allow AI coach recommendations",
  "ai.enabled": "AI coach enabled.",
  "ai.disabled": "AI coach disabled. No new AI requests will be made.",
  "ai.saveFailed": "Could not save setting.",

  "analytics.consentTitle": "Error reports (Sentry)",
  "analytics.consentHint": "Optional anonymized diagnostics.",
  "analytics.consentLabel": "Allow error and performance reports",
  "analytics.enabled": "Error reports (Sentry) enabled.",
  "analytics.disabled": "Error reports (Sentry) disabled.",

  "cookie.title": "Privacy & diagnostics",
  "cookie.body":
    "Session cookies are required for sign-in. Optionally, anonymized error and performance reports can be sent to Sentry — only with your consent. Details in the",
  "cookie.privacyLink": "privacy policy",
  "cookie.accept": "Accept",
  "cookie.decline": "Decline",

  "sync.title": "Sync conflict",
  "sync.body":
    "The cloud version is newer than your last sync. Please choose which version should apply — otherwise changes may be lost.",
  "sync.useCloud": "Use cloud",
  "sync.keepLocal": "Keep local",
  "sync.keepLocalFailed": "Could not write the local version to the cloud. Please try again.",
  "sync.networkError": "Network error while saving. Please try again.",

  "offline.banner": "Offline — changes are saved locally and sync when you are back online.",
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.continue": "Continue",
  "common.later": "Later",
  "common.loading": "Loading…",
  "common.error": "Something went wrong",
  "common.retry": "Try again",
  "common.details": "Details",

  "login.eyebrow": "Welcome back",
  "login.title": "Sign in",
  "login.password": "Password",
  "login.otp": "Email code",
  "login.passwordHint": "Email + password — then straight into the app. New here? “Create account”.",
  "login.otpHint": "Alternatively: 8-digit code by email (no password).",
  "login.email": "Email",
  "login.emailPlaceholder": "name@example.com",
  "login.forgotPassword": "Forgot password?",
  "login.signIn": "Sign in",
  "login.signingIn": "Signing in…",
  "login.createAccount": "Create account (password)",
  "login.legalCheckbox":
    "I am at least 16 years old, accept the terms of use, and have read the privacy policy (required to create an account).",
  "login.legalCheckboxOtp":
    "I am at least 16 years old, accept the terms of use, and have read the privacy policy (required for code sign-in / new account).",
  "login.terms": "Terms of use",
  "login.privacy": "Privacy policy",
  "login.requestCode": "Request code",
  "login.sending": "Sending…",
  "login.verifyCode": "Confirm code",
  "login.checking": "Checking…",
  "login.otherEmail": "Use another email",
  "login.codeLabel": "Confirmation code",
  "login.legalRequired": "Please confirm the terms, privacy policy, and minimum age of 16.",

  "profile.settings": "Settings",
};

const catalogs: Record<AppLocale, Record<MessageKey, string>> = {
  de: de as Record<MessageKey, string>,
  en,
};

export function translate(locale: AppLocale, key: MessageKey, vars?: Record<string, string | number>) {
  let text = catalogs[locale][key] ?? catalogs.de[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export { de };
