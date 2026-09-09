"use client";

import { useState } from "react";

type PasswordChangeSettingsProps = {
  onFeedback: (message: string, tone: "success" | "error" | "info") => void;
};

export default function PasswordChangeSettings({ onFeedback }: PasswordChangeSettingsProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      onFeedback("Das neue Passwort muss mindestens 8 Zeichen lang sein.", "error");
      return;
    }
    if (password !== confirmation) {
      onFeedback("Die beiden Passwörter stimmen nicht überein.", "error");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        const message = body?.error === "session_expired"
          ? "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an."
          : "Passwort konnte nicht geändert werden.";
        onFeedback(message, "error");
        return;
      }
      setPassword("");
      setConfirmation("");
      onFeedback("Passwort erfolgreich geändert.", "success");
    } catch {
      onFeedback("Passwort konnte nicht geändert werden.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="app-card mt-4">
      <p className="section-eyebrow">Sicherheit</p>
      <h2 className="section-title mt-1">Passwort ändern</h2>
      <p className="mt-1 text-sm text-muted">Mindestens 8 Zeichen. Deine aktive Sitzung bleibt erhalten.</p>
      <form className="mt-3 space-y-3" onSubmit={submit}>
        <label className="block">
          <span className="input-label">Neues Passwort</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" className="input" required />
        </label>
        <label className="block">
          <span className="input-label">Neues Passwort wiederholen</span>
          <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} autoComplete="new-password" className="input" required />
        </label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !password || !confirmation}>
          {saving ? "Wird geändert …" : "Passwort speichern"}
        </button>
      </form>
    </section>
  );
}
