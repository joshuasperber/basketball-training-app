import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPasswordResetRedirectUrl } from "@/lib/auth-redirect";
import { redirectToRecoveryPageIfHashPresent } from "@/lib/auth-recovery-client";

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
