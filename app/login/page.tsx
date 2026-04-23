"use client";

import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";

const RATE_LIMIT_HINT = "Bitte warte ca. 60 Sekunden und versuche es dann erneut.";

function normalizeCodeInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setErrorCode(params.get("error_code"));
    const next = params.get("next");
    setNextPath(next && next.startsWith("/") ? next : null);
  }, []);

  const urlError = useMemo(() => {
    if (errorCode === "otp_expired") {
      return "Der Code ist abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen Code an.";
    }

    if (errorCode === "over_email_send_rate_limit") {
      return `Zu viele E-Mails in kurzer Zeit. ${RATE_LIMIT_HINT}`;
    }

    return null;
  }, [errorCode]);

  const sendCode = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // bewusst ohne Redirect: wir nutzen den Code-Flow.
        emailRedirectTo: undefined,
      },
    });

    if (error) {
      const friendly = error.message.toLowerCase().includes("rate limit")
        ? `Zu viele Versuche. ${RATE_LIMIT_HINT}`
        : error.message;
      setMessage(friendly);
    } else {
      setCodeSent(true);
      setMessage("Code wurde gesendet. Bitte gib den 6-stelligen Bestätigungscode aus der E-Mail ein.");
    }

    setLoading(false);
  };

  const verifyCode = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode,
      type: "email",
    });

    if (error || !data.session?.access_token || !data.session.refresh_token) {
      setMessage(error?.message ?? "Code ungültig oder abgelaufen.");
      setLoading(false);
      return;
    }

    const sessionRes = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      }),
    });

    if (!sessionRes.ok) {
      setMessage("Session konnte nicht gespeichert werden. Bitte versuche es erneut.");
      setLoading(false);
      return;
    }

    const destination = nextPath ?? "/dashboard";
    window.location.replace(destination);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h1 className="text-2xl font-semibold">Login</h1>
        <p className="text-sm text-zinc-400">Melde dich per 6-stelligem E-Mail-Code an.</p>

        {urlError ? <p className="rounded-lg border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-200">{urlError}</p> : null}

        <p className="text-xs text-zinc-500">
          Falls du weiterhin nur einen Link statt eines Codes erhältst, passe in Supabase die Email-Template auf OTP-Token an.
        </p>

        {!codeSent ? (
          <form onSubmit={sendCode} className="space-y-4">
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
              {loading ? "Sende..." : "Code anfordern"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm text-zinc-300">Bestätigungscode</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(event) => setOtpCode(normalizeCodeInput(event.target.value))}
                required
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 tracking-[0.3em] outline-none ring-green-500 focus:ring-2"
                maxLength={6}
                placeholder="123456"
              />
            </label>

            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-70"
            >
              {loading ? "Prüfe..." : "Code bestätigen"}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setCodeSent(false);
                setOtpCode("");
                setMessage(null);
              }}
              className="w-full rounded-xl border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              Andere E-Mail verwenden
            </button>
          </form>
        )}

        {message ? <p className="text-sm text-zinc-300">{message}</p> : null}
      </div>
    </main>
  );
}