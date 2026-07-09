export const ANALYTICS_CONSENT_KEY = "bt.consent.analytics.v1";
export const CONSENT_UI_DECIDED_KEY = "bt.consent.ui-decided.v1";

export type AnalyticsConsent = "granted" | "denied";

export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

export function hasConsentUiDecision(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CONSENT_UI_DECIDED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAnalyticsConsent(choice: AnalyticsConsent) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, choice);
  window.localStorage.setItem(CONSENT_UI_DECIDED_KEY, "1");
  window.dispatchEvent(new Event("bt:analytics-consent-updated"));
}

export function grantAnalyticsConsent() {
  setAnalyticsConsent("granted");
}

export function denyAnalyticsConsent() {
  setAnalyticsConsent("denied");
}
