import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAuthConfirmUrl, buildPasswordResetRedirectUrl } from "@/lib/auth-redirect";
import { redirectToRecoveryPageIfHashPresent } from "@/lib/auth-recovery-client";
import { safeInternalPath } from "@/lib/safe-redirect";
import { friendlyAuthErrorMessage } from "@/lib/auth-messages";

describe("auth-redirect", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://basketball-training-app-tau.vercel.app",
      },
    });
  });

  it("builds reset URL on current origin", () => {
    const url = buildPasswordResetRedirectUrl("Test@Web.de");
    expect(url).toBe(
      "https://basketball-training-app-tau.vercel.app/auth/reset-password?email=test%40web.de",
    );
  });

  it("rejects protocol-relative and encoded external redirect targets", () => {
    expect(safeInternalPath("//evil.example")).toBe("/dashboard");
    expect(safeInternalPath("/%2f%2fevil.example")).toBe("/dashboard");
    expect(safeInternalPath("/\\evil.example")).toBe("/dashboard");
    expect(safeInternalPath("/team?tab=roster")).toBe("/team?tab=roster");
    expect(buildAuthConfirmUrl("//evil.example")).toBe(
      "https://basketball-training-app-tau.vercel.app/auth/confirm?next=%2Fdashboard",
    );
  });
});

describe("auth error messages", () => {
  it("does not reveal whether email or password was wrong", () => {
    expect(friendlyAuthErrorMessage("Invalid login credentials", "signin")).toBe(
      "Passwort oder E-Mail-Adresse sind falsch.",
    );
    expect(friendlyAuthErrorMessage("invalid_credentials", "signin")).toBe(
      "Passwort oder E-Mail-Adresse sind falsch.",
    );
  });

  it("explains invalid and unconfirmed email addresses", () => {
    expect(friendlyAuthErrorMessage("Unable to validate email address", "signup")).toBe(
      "Bitte gib eine gültige E-Mail-Adresse ein.",
    );
    expect(friendlyAuthErrorMessage("Email not confirmed", "signin")).toContain("noch nicht bestätigt");
  });
});

describe("auth-recovery-client redirect", () => {
  let replaceMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    replaceMock = vi.fn();
    vi.stubGlobal("window", {
      location: {
        href: "https://example.com/login#access_token=abc&refresh_token=def&type=recovery",
        pathname: "/login",
        search: "",
        hash: "#access_token=abc&refresh_token=def&type=recovery",
        origin: "https://example.com",
        replace: replaceMock,
      },
    });
  });

  it("redirects recovery hash from login to reset-password", () => {
    const redirected = redirectToRecoveryPageIfHashPresent();
    expect(redirected).toBe(true);
    expect(replaceMock).toHaveBeenCalledWith(
      "/auth/reset-password#access_token=abc&refresh_token=def&type=recovery",
    );
  });

  it("does not redirect when already on reset page", () => {
    window.location.href = "https://example.com/auth/reset-password#access_token=abc&refresh_token=def&type=recovery";
    window.location.pathname = "/auth/reset-password";
    expect(redirectToRecoveryPageIfHashPresent()).toBe(false);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does not redirect non-recovery links", () => {
    window.location.hash = "#access_token=abc&refresh_token=def&type=magiclink";
    expect(redirectToRecoveryPageIfHashPresent()).toBe(false);
  });
});
