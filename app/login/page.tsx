"use client";

import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { friendlyAuthErrorMessage } from "@/lib/auth-messages";
import { ACTIVE_AUTH_EMAIL_KEY } from "@/lib/auth-session-align";
import { createClient } from "@/lib/supabase";

const RATE_LIMIT_HINT = "Bitte warte ca. 60 Sekunden und versuche es dann erneut.";
const LAST_LOGIN_EMAIL_KEY = "bt.last-login-email.v1";

type LoginMode = "password" | "otp";

function normalizeCodeInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

async function persistSessionAndRedirect(
  session: { access_token: string; refresh_token: string; expires_in: number },
  email: string,
  nextPath: string | null,
) {
  const sessionRes = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
    }),
  });

  if (!sessionRes.ok) {
    return "Session konnte nicht gespeichert werden. Bitte versuche es erneut.";
  }

  if (typeof window !== "undefined") {
    const normalized = email.trim().toLowerCase();
    window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, normalized);
    window.localStorage.setItem(ACTIVE_AUTH_EMAIL_KEY, normalized);
  }

  const destination = nextPath ?? "/dashboard";
  window.location.replace(destination);
  return null;
}

export default function LoginPage() {
  const supabase = createClient();
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [awaitingEmailConfirm, setAwaitingEmailConfirm] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const timer = window.setTimeout(() => {
      setErrorCode(params.get("error_code"));
      const next = params.get("next");
      setNextPath(next && next.startsWith("/") ? next : null);
      const savedEmail = window.localStorage.getItem(LAST_LOGIN_EMAIL_KEY);
      if (savedEmail) setEmail(savedEmail);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const configError = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (!url || !anon) return "Supabase URL oder ANON-Key fehlt in .env.local.";
    if (anon.startsWith("sb_secret_")) {
      return "ANON-Key ist falsch: sb_secret_ gehört in SUPABASE_SERVICE_ROLE_KEY, nicht in NEXT_PUBLIC_SUPABASE_ANON_KEY.";
    }
    if (/\/auth\/v1|\/rest\/v1/i.test(url.replace(/\/$/, ""))) {
      return "SUPABASE_URL enthält /auth/v1 oder /rest/v1 — entfernen. Nur https://PROJEKT-REF.supabase.co eintragen.";
    }
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url.trim())) {
      return "SUPABASE_URL Format prüfen: https://DEIN-PROJEKT-REF.supabase.co";
    }
    return null;
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

  const signInWithPassword = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      setMessage(
        friendlyAuthErrorMessage(error?.message, "signin") ??
          "Anmeldung fehlgeschlagen. Prüfe E-Mail/Passwort oder bestätige zuerst deine E-Mail.",
      );
      setLoading(false);
      return;
    }

    const redirectError = await persistSessionAndRedirect(data.session, email, nextPath);
    if (redirectError) {
      setMessage(redirectError);
      setLoading(false);
    }
  };

  const signUpWithPassword = async () => {
    setLoading(true);
    setMessage(null);

    if (password.length < 6) {
      setMessage("Passwort mindestens 6 Zeichen.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUpWithPassword({ email, password });
    if (error) {
      setMessage(friendlyAuthErrorMessage(error.message, "signup"));
      setLoading(false);
      return;
    }

    if (data.needsEmailConfirmation || !data.session) {
      setAwaitingEmailConfirm(true);
      setMessage(
        "Konto angelegt. Du hast „Confirm email“ aktiv — öffne den Bestätigungslink in deiner Mail (auch Spam), danach „Anmelden“. Oder in Supabase Confirm email ausschalten für sofortigen Login.",
      );
      setLoading(false);
      return;
    }

    setAwaitingEmailConfirm(false);

    const redirectError = await persistSessionAndRedirect(data.session, email, nextPath);
    if (redirectError) {
      setMessage(redirectError);
      setLoading(false);
    }
  };

  const resendConfirmation = async () => {
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.resendSignupConfirmation({ email });
    if (error) {
      setMessage(friendlyAuthErrorMessage(error.message, "signup"));
    } else {
      setMessage("Bestätigungs-Mail erneut gesendet — prüfe Posteingang und Spam.");
    }
    setLoading(false);
  };

  const sendCode = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: undefined },
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

    if (error || !data.session) {
      setMessage(error?.message ?? "Code ungültig oder abgelaufen.");
      setLoading(false);
      return;
    }

    const redirectError = await persistSessionAndRedirect(data.session, email, nextPath);
    if (redirectError) {
      setMessage(redirectError);
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md app-card animate-in">
        <div className="flex items-center gap-3">
          <div className="avatar-bubble" aria-hidden>
            🏀
          </div>
          <div>
            <p className="page-eyebrow">Welcome back</p>
            <h1 className="text-2xl font-extrabold tracking-tight">Anmelden</h1>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={`btn btn-sm flex-1 ${mode === "password" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setMode("password");
              setCodeSent(false);
              setMessage(null);
            }}
          >
            Passwort
          </button>
          <button
            type="button"
            className={`btn btn-sm flex-1 ${mode === "otp" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setMode("otp");
              setMessage(null);
            }}
          >
            E-Mail-Code
          </button>
        </div>

        <p className="mt-3 text-sm text-muted">
          {mode === "password"
            ? "Melde dich mit E-Mail und Passwort an — bleibt auch nach Ausloggen nutzbar."
            : "Alternativ: 8-stelliger Code per E-Mail."}
        </p>

        {configError ? (
          <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {configError}
          </p>
        ) : null}

        {urlError ? (
          <p className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {urlError}
          </p>
        ) : null}

        {mode === "password" ? (
          <form onSubmit={signInWithPassword} className="mt-5 space-y-3">
            <div>
              <label className="input-label" htmlFor="login-email">
                E-Mail
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="input"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="input-label" htmlFor="login-password">
                Passwort
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                className="input"
                autoComplete="current-password"
              />
            </div>
            <button type="submit" disabled={loading || Boolean(configError)} className="btn btn-primary btn-block">
              {loading ? "Anmelden…" : "Anmelden"}
            </button>
            <button
              type="button"
              disabled={loading || Boolean(configError)}
              onClick={() => void signUpWithPassword()}
              className="btn btn-outline btn-block"
            >
              {loading ? "…" : "Konto anlegen (Passwort)"}
            </button>
            {awaitingEmailConfirm ? (
              <button
                type="button"
                disabled={loading || !email}
                onClick={() => void resendConfirmation()}
                className="btn btn-ghost btn-block text-xs"
              >
                Bestätigungs-Mail erneut senden
              </button>
            ) : null}
          </form>
        ) : !codeSent ? (
          <form onSubmit={sendCode} className="mt-5 space-y-3">
            <div>
              <label className="input-label" htmlFor="login-email-otp">
                E-Mail
              </label>
              <input
                id="login-email-otp"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="input"
                placeholder="you@example.com"
              />
            </div>
            <button type="submit" disabled={loading || Boolean(configError)} className="btn btn-primary btn-block">
              {loading ? "Sende…" : "Code anfordern"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-5 space-y-3">
            <div>
              <label className="input-label" htmlFor="login-otp">
                Bestätigungscode
              </label>
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
              disabled={loading || otpCode.length !== 8 || Boolean(configError)}
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
          <strong className="text-muted">Projekt-REF:</strong> aus der URL, z. B.{" "}
          <code className="text-[10px]">pqmqkvgtynqpdmiwugwc</code> →{" "}
          <code className="text-[10px]">https://pqmqkvgtynqpdmiwugwc.supabase.co</code>
          <br />
          <strong className="text-muted">Lokale Tests ohne Bestätigungs-Mail:</strong> Sign In / Providers →{" "}
          <strong>Confirm email</strong> ausschalten (siehe Screenshot).
          <br />
          <strong className="text-muted">„No API key“ im Browser:</strong> normal beim Öffnen der Settings-URL ohne Key —
          die App sendet den Key automatisch mit.
        </p>
      </div>
    </main>
  );
}
