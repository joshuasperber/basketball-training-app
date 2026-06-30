import { finalizeClientAuthSession } from "@/lib/auth-finalize-client";

function parseHashParams(hash: string) {
  const cleanHash = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(cleanHash);
}

/** Recovery-Link (Hash, PKCE-Code oder token_hash) in Session-Cookies überführen. */
export async function bootstrapRecoverySessionFromUrl(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof window === "undefined") return { ok: false, error: "Kein Browser-Kontext." };

  const url = new URL(window.location.href);
  const hash = parseHashParams(window.location.hash);
  const get = (key: string) => url.searchParams.get(key) ?? hash.get(key);

  const flowType = get("type") ?? "";
  const accessToken = get("access_token");
  const refreshToken = get("refresh_token");
  const expiresIn = Number(get("expires_in") ?? "3600");
  const code = get("code");
  const tokenHash = get("token_hash");
  const isRecovery = flowType === "recovery" || url.pathname.includes("reset-password");

  if (accessToken && refreshToken && (isRecovery || flowType === "recovery")) {
    const error = await finalizeClientAuthSession(
      {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: Number.isFinite(expiresIn) ? expiresIn : 3600,
      },
      { nextPath: null, skipCloudRestore: true },
    );
    if (error) return { ok: false, error };
    window.history.replaceState(null, "", url.pathname + url.search);
    return { ok: true };
  }

  if (code || tokenHash) {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    const exchangeRes = await fetch("/api/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        code: code ?? undefined,
        token_hash: tokenHash ?? undefined,
        type: isRecovery ? "recovery" : flowType || "recovery",
      }),
    });

    if (!exchangeRes.ok) {
      return { ok: false, error: "Der Link ist ungültig oder abgelaufen." };
    }

    const cleanUrl = new URL(url.pathname + url.search, url.origin);
    window.history.replaceState(null, "", cleanUrl.toString());
    return { ok: true };
  }

  return { ok: false, error: "Kein gültiger Reset-Link." };
}

export function redirectToRecoveryPageIfHashPresent() {
  if (typeof window === "undefined") return false;

  const url = new URL(window.location.href);
  if (url.pathname === "/auth/reset-password") return false;

  const hash = parseHashParams(window.location.hash);
  const get = (key: string) => url.searchParams.get(key) ?? hash.get(key);
  const flowType = get("type") ?? "";
  if (flowType !== "recovery") return false;

  const hasCredentials =
    (Boolean(get("access_token")) && Boolean(get("refresh_token"))) ||
    Boolean(get("code")) ||
    Boolean(get("token_hash"));
  if (!hasCredentials) return false;

  const target = `/auth/reset-password${url.search}${url.hash}`;
  window.location.replace(target);
  return true;
}
