"use client";

import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";

const RATE_LIMIT_HINT = "Bitte warte ca. 60 Sekunden und versuche es dann erneut.";
const AUTH_REDIRECT_OVERRIDE = process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL;

function normalizeRedirectUrl(rawUrl: string | undefined, fallbackOrigin: string) {
  if (!rawUrl?.trim()) {
    return `${fallbackOrigin}/auth/confirm`;
  }

  const value = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    return new URL(withProtocol).toString();
  } catch {
    return `${fallbackOrigin}/auth/confirm`;
  }
}

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState<string | null>(null);

  const callbackInfo = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        appOrigin: "",
        redirectUrl: AUTH_REDIRECT_OVERRIDE ?? "",
      };
    }

    return {
      appOrigin: window.location.origin,
      redirectUrl: normalizeRedirectUrl(AUTH_REDIRECT_OVERRIDE, window.location.origin),
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setErrorCode(params.get("error_code"));
    const next = params.get("next");
    setNextPath(next && next.startsWith("/") ? next : null);
  }, []);

  const redirectDomainMismatch =
    callbackInfo.appOrigin && callbackInfo.redirectUrl
      ? !callbackInfo.redirectUrl.startsWith(callbackInfo.appOrigin)
      : false;

  const urlError = useMemo(() => {
    if (errorCode === "otp_expired") {
      return "Der Magic-Link ist abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen Link an.";
    }

    if (errorCode === "over_email_send_rate_limit") {
      return `Zu viele E-Mails in kurzer Zeit. ${RATE_LIMIT_HINT}`;
    }

    return null;
  }, [errorCode]);

  const onSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const redirectUrl = nextPath
      ? `${callbackInfo.redirectUrl}${callbackInfo.redirectUrl.includes("?") ? "&" : "?"}next=${encodeURIComponent(nextPath)}`
      : callbackInfo.redirectUrl;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) {
      const friendly = error.message.toLowerCase().includes("rate limit")
        ? `Zu viele Versuche. ${RATE_LIMIT_HINT}`
        : error.message;
      setMessage(friendly);
    } else {
      setMessage(`Magic Link wurde gesendet. Erwartete Ziel-URL: ${redirectUrl}`);
    }

    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h1 className="text-2xl font-semibold">Login</h1>
        <p className="text-sm text-zinc-400">Melde dich per Magic Link an.</p>

        {urlError ? <p className="rounded-lg border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-200">{urlError}</p> : null}

        {redirectDomainMismatch ? (
          <div className="rounded-lg border border-amber-700 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
            <p className="font-semibold">Redirect-URL passt nicht zur aktuellen App-Domain.</p>
            <p className="mt-1">Aktuelle App: {callbackInfo.appOrigin}</p>
            <p className="mt-1">Auth-Redirect: {callbackInfo.redirectUrl}</p>
            <p className="mt-2">
              Prüfe in Supabase → Authentication → URL Configuration die Allow List. Dort müssen mindestens
              <br />
              {callbackInfo.appOrigin}/auth/confirm
              <br />
              und
              <br />
              {callbackInfo.appOrigin}/auth/callback
              <br />
              eingetragen sein.
            </p>
          </div>
        ) : null}

        <label className="block space-y-2">
          <span className="text-sm text-zinc-300">E-Mail</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-green-500 focus:ring-2"
            placeholder="you@example.com"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-green-600 px-4 py-2 font-semibold text-white transition hover:bg-green-500 disabled:opacity-70"
        >
          {loading ? "Sending..." : "Send Magic Link"}
        </button>

        {message ? <p className="text-sm text-zinc-300">{message}</p> : null}
      </form>
    </main>
  );
}