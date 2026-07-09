"use client";

import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppBusyOverlay from "@/components/AppBusyOverlay";
import { friendlyAuthErrorMessage } from "@/lib/auth-messages";
import { alignLocalAuthAfterServerSession, finalizeClientAuthSession } from "@/lib/auth-finalize-client";
import { buildPasswordResetConfirmUrl } from "@/lib/auth-redirect";
import { redirectToRecoveryPageIfHashPresent } from "@/lib/auth-recovery-client";
import { hasOfflineSessionHint } from "@/lib/offline-session";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const RATE_LIMIT_HINT = "Bitte warte ca. 60 Sekunden und versuche es dann erneut.";
const LAST_LOGIN_EMAIL_KEY = "bt.last-login-email.v1";

type LoginMode = "password" | "otp";

function normalizeCodeInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

async function completeServerAuth(options: {
  response: Response;
  email: string;
  nextPath: string | null;
  freshAccount?: boolean;
}) {
  if (!options.response.ok) {
    const payload = (await options.response.json().catch(() => null)) as { message?: string; error?: string } | null;
    return friendlyAuthErrorMessage(payload?.message ?? payload?.error, "signin");
  }

  const payload = (await options.response.json()) as { user?: { id?: string; email?: string } };
  return alignLocalAuthAfterServerSession({
    nextPath: options.nextPath,
    freshAccount: options.freshAccount,
    emailHint: payload.user?.email ?? options.email,
    userId: payload.user?.id,
  });
}

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Anmeldung läuft …");
  const [busySublabel, setBusySublabel] = useState("Einen Moment — wir bereiten dein Dashboard vor.");
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [nextPath, setNextPath] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (redirectToRecoveryPageIfHashPresent()) return;

    if (!navigator.onLine && hasOfflineSessionHint()) {
      router.replace("/dashboard");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const timer = window.setTimeout(() => {
      setErrorCode(params.get("error_code"));
      const reason = params.get("reason");
      if (params.get("message") === "password_updated") {
        setMessage("Passwort wurde geändert — du kannst dich jetzt anmelden.");
      } else if (reason === "missing_session") {
        setMessage("Bitte melde dich an, um fortzufahren.");
      } else if (reason === "session_invalid") {
        setMessage("Deine Sitzung ist abgelaufen — bitte erneut anmelden.");
      } else if (params.get("next") && !params.get("error_code")) {
        setMessage("Melde dich an, um zur gewünschten Seite zu gelangen.");
      }
      const next = params.get("next");
      setNextPath(next && next.startsWith("/") ? next : null);
      const savedEmail = window.localStorage.getItem(LAST_LOGIN_EMAIL_KEY);
      if (savedEmail) setEmail(savedEmail);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router]);

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
    setBusyLabel("Anmeldung läuft …");
    setBusySublabel("Einen Moment — wir bereiten dein Dashboard vor.");
    setLoading(true);
    setMessage(null);

    const trimmedEmail = email.trim();

    try {
      window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, trimmedEmail);
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      setBusyLabel("Trainingsdaten werden geladen …");
      setBusySublabel("Dein Fortschritt wird aus der Cloud synchronisiert.");

      const redirectError = await completeServerAuth({
        response,
        email: trimmedEmail,
        nextPath,
      });
      if (redirectError) {
        setMessage(redirectError);
        setLoading(false);
        return;
      }

      setMessage("Anmeldung erfolgreich — weiterleiten …");
    } catch {
      setMessage("Anmeldung fehlgeschlagen. Bitte erneut versuchen.");
      setLoading(false);
    }
  };

  const signUpWithPassword = async () => {
    setBusyLabel("Konto wird erstellt …");
    setBusySublabel("Einen Moment — wir richten dein Profil ein.");
    setLoading(true);
    setMessage(null);

    const trimmedEmail = email.trim();
    if (!acceptedLegal) {
      setMessage("Bitte Nutzungsbedingungen und Datenschutz bestätigen sowie das Mindestalter von 16 Jahren.");
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setMessage("Passwort mindestens 6 Zeichen.");
      setLoading(false);
      return;
    }

    try {
      window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, trimmedEmail);
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      setBusyLabel("Trainingsdaten werden geladen …");
      setBusySublabel("Dein Fortschritt wird aus der Cloud synchronisiert.");

      const redirectError = await completeServerAuth({
        response,
        email: trimmedEmail,
        nextPath,
        freshAccount: true,
      });
      if (redirectError) {
        setMessage(friendlyAuthErrorMessage(redirectError, "signup"));
        setLoading(false);
        return;
      }

      setMessage("Konto erstellt — weiterleiten …");
    } catch {
      setMessage("Registrierung fehlgeschlagen. Bitte erneut versuchen.");
      setLoading(false);
    }
  };

  const requestPasswordReset = async () => {
    setBusyLabel("Reset-Link wird gesendet …");
    setBusySublabel("Einen Moment.");
    setLoading(true);
    setMessage(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setMessage("Bitte zuerst deine E-Mail-Adresse eingeben.");
      setLoading(false);
      return;
    }

    window.localStorage.setItem(LAST_LOGIN_EMAIL_KEY, trimmed);

    const { error } = await supabase.auth.resetPasswordForEmail({
      email: trimmed,
      redirectTo: buildPasswordResetConfirmUrl(trimmed),
    });

    if (error) {
      setMessage(friendlyAuthErrorMessage(error.message, "signin"));
    } else {
      setMessage(
        "Falls ein Konto mit dieser E-Mail existiert, wurde ein Reset-Link gesendet — prüfe Posteingang und Spam (max. ca. 2–4 Mails/Stunde).",
      );
    }
    setLoading(false);
  };

  const sendCode = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyLabel("Code wird gesendet …");
    setBusySublabel("Prüfe gleich dein Postfach.");
    setLoading(true);
    setMessage(null);

    if (!acceptedLegal) {
      setMessage("Bitte Nutzungsbedingungen und Datenschutz bestätigen sowie das Mindestalter von 16 Jahren.");
      setLoading(false);
      return;
    }

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
    setBusyLabel("Code wird geprüft …");
    setBusySublabel("Einen Moment — wir bereiten dein Dashboard vor.");
    setLoading(true);
    setMessage(null);

    if (!acceptedLegal) {
      setMessage("Bitte Nutzungsbedingungen und Datenschutz bestätigen sowie das Mindestalter von 16 Jahren.");
      setLoading(false);
      return;
    }

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

    setBusyLabel("Trainingsdaten werden geladen …");
    setBusySublabel("Dein Fortschritt wird aus der Cloud synchronisiert.");

    const redirectError = await finalizeClientAuthSession(data.session, { nextPath, emailHint: email.trim() });
    if (redirectError) {
      setMessage(redirectError);
      setLoading(false);
    }
  };

  return (
    <>
      <AppBusyOverlay open={loading} label={busyLabel} sublabel={busySublabel} />
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md app-card animate-in">
        <div className="flex items-center gap-3">
          <div className="avatar-bubble" aria-hidden>
            🏀
          </div>
          <div>
            <p className="page-eyebrow">Willkommen zurück</p>
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
            ? "E-Mail + Passwort — danach direkt in die App. Neu hier? „Konto anlegen“."
            : "Alternativ: 8-stelliger Code per E-Mail (ohne Passwort)."}
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
                placeholder="name@beispiel.de"
                autoComplete="email"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="input-label" htmlFor="login-password">
                  Passwort
                </label>
                <button
                  type="button"
                  disabled={loading || Boolean(configError) || !email.trim()}
                  onClick={() => void requestPasswordReset()}
                  className="text-xs text-[var(--brand-400)] hover:underline disabled:opacity-50"
                >
                  Passwort vergessen?
                </button>
              </div>
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
            <label className="flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={acceptedLegal}
                onChange={(event) => setAcceptedLegal(event.target.checked)}
              />
              <span>
                Ich bin mindestens 16 Jahre alt, akzeptiere die{" "}
                <Link href="/nutzungsbedingungen" className="text-[var(--brand-400)] underline">
                  Nutzungsbedingungen
                </Link>{" "}
                und habe die{" "}
                <Link href="/datenschutz" className="text-[var(--brand-400)] underline">
                  Datenschutzerklärung
                </Link>{" "}
                gelesen (für „Konto anlegen“ erforderlich).
              </span>
            </label>
            <button
              type="button"
              disabled={loading || Boolean(configError) || !acceptedLegal}
              onClick={() => void signUpWithPassword()}
              className="btn btn-outline btn-block"
            >
              {loading ? "…" : "Konto anlegen (Passwort)"}
            </button>
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
                placeholder="name@beispiel.de"
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={acceptedLegal}
                onChange={(event) => setAcceptedLegal(event.target.checked)}
              />
              <span>
                Ich bin mindestens 16 Jahre alt, akzeptiere die{" "}
                <Link href="/nutzungsbedingungen" className="text-[var(--brand-400)] underline">
                  Nutzungsbedingungen
                </Link>{" "}
                und habe die{" "}
                <Link href="/datenschutz" className="text-[var(--brand-400)] underline">
                  Datenschutzerklärung
                </Link>{" "}
                gelesen (erforderlich für Code-Anmeldung / neues Konto).
              </span>
            </label>
            <button
              type="submit"
              disabled={loading || Boolean(configError) || !acceptedLegal}
              className="btn btn-primary btn-block"
            >
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
              disabled={loading || otpCode.length !== 8 || Boolean(configError) || !acceptedLegal}
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
          <p className="mt-4 app-card--flat text-sm text-strong">
            {message}
          </p>
        ) : null}
      </div>
    </main>
    </>
  );
}
