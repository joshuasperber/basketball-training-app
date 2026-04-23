"use client";

import { useEffect, useMemo, useState } from "react";

function parseHashParams(hash: string) {
  const cleanHash = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(cleanHash);
}

export default function AuthConfirmPage() {
  const [message, setMessage] = useState("Anmeldung wird abgeschlossen …");

  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/auth/callback${window.location.search}`;
  }, []);

  useEffect(() => {
    async function run() {
      const url = new URL(window.location.href);
      const tokenHash = url.searchParams.get("token_hash");

      if (tokenHash) {
        window.location.replace(callbackUrl);
        return;
      }

      const hashParams = parseHashParams(window.location.hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const expiresIn = Number(hashParams.get("expires_in") ?? "3600");

      if (!accessToken || !refreshToken) {
        setMessage("Magic-Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.");
        window.setTimeout(() => window.location.replace("/login?error=access_denied"), 1500);
        return;
      }

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: Number.isFinite(expiresIn) ? expiresIn : 3600,
        }),
      });

      if (!response.ok) {
        setMessage("Session konnte nicht gespeichert werden. Bitte versuche es erneut.");
        return;
      }

      window.location.replace("/dashboard");
    }

    run().catch(() => {
      setMessage("Fehler bei der Anmeldung. Bitte versuche es erneut.");
    });
  }, [callbackUrl]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <p className="text-sm text-zinc-300">{message}</p>
    </main>
  );
}
