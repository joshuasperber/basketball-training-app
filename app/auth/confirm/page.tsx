"use client";

import { FormEvent, useEffect, useState } from "react";
import { finalizeClientAuthSession, alignLocalAuthAfterServerSession } from "@/lib/auth-finalize-client";

function parseHashParams(hash: string) {
  const cleanHash = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(cleanHash);
}

function buildNextPath(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export default function AuthConfirmPage() {
  const [message, setMessage] = useState("Anmeldung wird abgeschlossen …");

  useEffect(() => {
    async function run() {
      const url = new URL(window.location.href);
      const hash = parseHashParams(window.location.hash);
      const get = (key: string) => url.searchParams.get(key) ?? hash.get(key);

      const flowType = get("type") ?? "";
      const emailHint = get("email") ?? "";
      const nextPath =
        flowType === "recovery"
          ? emailHint
            ? `/auth/reset-password?email=${encodeURIComponent(emailHint.trim().toLowerCase())}`
            : "/auth/reset-password"
          : buildNextPath(get("next"));
      const freshAccount = flowType === "signup" || flowType === "invite";

      const accessToken = get("access_token");
      const refreshToken = get("refresh_token");
      const expiresIn = Number(get("expires_in") ?? "3600");
      const tokenHash = get("token_hash");
      const code = get("code");

      try {
        if (accessToken && refreshToken) {
          const error = await finalizeClientAuthSession(
            {
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_in: Number.isFinite(expiresIn) ? expiresIn : 3600,
            },
            {
              nextPath,
              freshAccount,
              emailHint: emailHint || undefined,
              skipCloudRestore: flowType === "recovery",
            },
          );
          if (error) setMessage(error);
          return;
        }

        if (tokenHash || code) {
          await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
          const exchangeRes = await fetch("/api/auth/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              code: code ?? undefined,
              token_hash: tokenHash ?? undefined,
              type: flowType || "signup",
            }),
          });

          if (!exchangeRes.ok) {
            setMessage("Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.");
            window.setTimeout(() => window.location.replace("/login?error=access_denied&error_code=otp_expired"), 2000);
            return;
          }

          const payload = (await exchangeRes.json()) as { user?: { id?: string; email?: string } | null };
          const error = await alignLocalAuthAfterServerSession({
            nextPath,
            freshAccount,
            emailHint: payload.user?.email ?? (emailHint || undefined),
            userId: payload.user?.id,
            skipCloudRestore: flowType === "recovery",
          });
          if (error) setMessage(error);
          return;
        }

        setMessage("Link ist ungültig oder abgelaufen.");
        window.setTimeout(() => window.location.replace("/login?error=access_denied&error_code=otp_expired"), 2000);
      } catch {
        setMessage("Fehler bei der Anmeldung. Bitte versuche es erneut.");
      }
    }

    void run();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <p className="text-sm text-zinc-300">{message}</p>
    </main>
  );
}
