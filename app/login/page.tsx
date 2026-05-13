"use client";

import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase";

const RATE_LIMIT_HINT = "Bitte warte ca. 60 Sekunden und versuche es dann erneut.";
const LAST_LOGIN_EMAIL_KEY = "bt.last-login-email.v1";

function normalizeCodeInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
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
    const timer = window.setTimeout(() => {
      setErrorCode(params.get("error_code"));
      const next = params.get("next");
      setNextPath(next && next.startsWith("/") ? next : null);
    }, 0);
    return () => window.clearTimeout(timer);
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
        // kein Redirect-Link-Flow, wir nutzen den Code-Flow
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
      setMessage("Code wurde gesendet. Bitte gib den 8-stelligen Bestätigungscode aus der E-Mail ein.");
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

    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, email.trim().toLowerCase());
    }

    const destination = nextPath ?? "/dashboard";
    window.location.replace(destination);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md app-card animate-in">
        <div className="flex items-center gap-3">
          <div className="avatar-bubble" aria-hidden>🏀</div>
          <div>
            <p className="page-eyebrow">Welcome back</p>
            <h1 className="text-2xl font-extrabold tracking-tight">Anmelden</h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">
          Melde dich per 8-stelligem E-Mail-Code an. Sicher und ohne Passwort.
        </p>

        {urlError ? (
          <p className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {urlError}
          </p>
        ) : null}

        {!codeSent ? (
          <form onSubmit={sendCode} className="mt-5 space-y-3">
            <div>
              <label className="input-label" htmlFor="login-email">E-Mail</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="input"
                placeholder="you@example.com"
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {loading ? "Sende…" : "Code anfordern"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-5 space-y-3">
            <div>
              <label className="input-label" htmlFor="login-otp">Bestätigungscode</label>
              <input
                id="login-otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(event) => setOtpCode(normalizeCodeInput(event.target.value))}
                required
                className="input text-center text-lg font-semibold tracking-[0.4em]"
                maxLength={8}
                placeholder="12345678"
              />
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.length !== 8}
              className="btn btn-cyan btn-block"
            >
              {loading ? "Prüfe…" : "Code bestätigen"}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setCodeSent(false);
                setOtpCode("");
                setMessage(null);
              }}
              className="btn btn-ghost btn-block"
            >
              Andere E-Mail verwenden
            </button>
          </form>
        )}

        {message ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-strong">
            {message}
          </p>
        ) : null}

        <p className="mt-5 text-xs text-faint">
          Tipp: Falls du nur einen Link statt eines Codes erhältst, in Supabase die Email-Template auf OTP-Token umstellen.
        </p>
      </div>
    </main>
  );
}