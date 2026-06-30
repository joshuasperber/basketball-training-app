"use client";

import { FormEvent, useEffect, useState } from "react";
import { alignLocalAuthAfterServerSession } from "@/lib/auth-finalize-client";
import { bootstrapRecoverySessionFromUrl } from "@/lib/auth-recovery-client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function init() {
      setBootstrapping(true);

      const meProbe = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
      if (!meProbe.ok) {
        const boot = await bootstrapRecoverySessionFromUrl();
        if (!boot.ok) {
          setAuthorized(false);
          setMessage(boot.error);
          setBootstrapping(false);
          return;
        }
      }

      const meRes = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
      if (!meRes.ok) {
        setAuthorized(false);
        setMessage("Der Reset-Link ist ungültig oder abgelaufen. Bitte fordere auf der Login-Seite einen neuen an.");
        setBootstrapping(false);
        return;
      }

      const me = (await meRes.json()) as { email?: string };
      const sessionEmail = me.email?.trim().toLowerCase() ?? "";
      if (!sessionEmail) {
        setAuthorized(false);
        setMessage("Konto konnte nicht verifiziert werden.");
        setBootstrapping(false);
        return;
      }

      setEmail(sessionEmail);
      setAuthorized(true);
      setBootstrapping(false);
    }

    void init();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (password.length < 6) {
      setMessage("Passwort mindestens 6 Zeichen.");
      return;
    }
    if (password !== confirm) {
      setMessage("Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
        if (payload?.error === "session_expired") {
          setMessage("Der Reset-Link ist abgelaufen. Bitte fordere auf der Login-Seite einen neuen an.");
        } else {
          setMessage(payload?.message ?? "Passwort konnte nicht gesetzt werden. Fordere einen neuen Reset-Link an.");
        }
        return;
      }

      const payload = (await response.json()) as { user?: { id?: string; email?: string } };
      setMessage("Passwort gespeichert — du wirst eingeloggt …");
      const redirectError = await alignLocalAuthAfterServerSession({
        nextPath: "/dashboard",
        emailHint: payload.user?.email ?? email,
        userId: payload.user?.id,
      });
      if (redirectError) {
        setMessage(redirectError);
      }
    } catch {
      setMessage("Passwort konnte nicht gesetzt werden. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  };

  if (bootstrapping) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-muted">Reset-Link wird geprüft …</p>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md app-card">
          <h1 className="text-xl font-bold">Link ungültig</h1>
          <p className="mt-2 text-sm text-muted">
            {message ??
              "Bitte auf der Login-Seite erneut „Passwort vergessen?“ wählen und den neuen Link öffnen."}
          </p>
          <button type="button" className="btn btn-primary btn-block mt-4" onClick={() => window.location.assign("/login")}>
            Zur Login-Seite
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md app-card animate-in">
        <p className="page-eyebrow">Passwort zurücksetzen</p>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Neues Passwort für <span className="text-brand">{email}</span> vergeben
        </h1>
        <p className="mt-2 text-sm text-muted">
          Der Link ist an diese E-Mail gebunden. Du kannst hier nur das Passwort für genau dieses Konto ändern — nicht
          für andere Adressen.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2.5">
            <p className="text-xs text-faint">Konto</p>
            <p className="text-sm font-semibold text-strong">{email}</p>
          </div>
          <div>
            <label className="input-label" htmlFor="new-password">
              Neues Passwort
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              className="input"
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div>
            <label className="input-label" htmlFor="confirm-password">
              Passwort wiederholen
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
              minLength={6}
              className="input"
              autoComplete="new-password"
            />
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary btn-block">
            {loading ? "Speichern…" : "Passwort speichern & anmelden"}
          </button>
        </form>

        {message ? <p className="mt-4 text-sm text-strong">{message}</p> : null}
      </div>
    </main>
  );
}
