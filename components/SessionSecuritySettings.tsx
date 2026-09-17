"use client";

import { useState } from "react";

export default function SessionSecuritySettings({
  onFeedback,
}: {
  onFeedback: (message: string, tone: "success" | "error" | "info") => void;
}) {
  const [busy, setBusy] = useState(false);

  const revokeOtherDevices = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scope: "others" }),
      });
      if (!response.ok) throw new Error("revoke_failed");
      onFeedback("Andere Geräte wurden abgemeldet. Diese Sitzung bleibt aktiv.", "success");
    } catch {
      onFeedback("Andere Sitzungen konnten gerade nicht beendet werden.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-soft)] p-3">
      <p className="text-sm font-semibold text-strong">Angemeldete Geräte</p>
      <p className="mt-1 text-xs text-muted">
        Beendet alle anderen Browser- und Geräte-Sitzungen, ohne dich auf diesem Gerät abzumelden.
      </p>
      <button type="button" className="btn btn-outline btn-sm mt-3" disabled={busy} onClick={() => void revokeOtherDevices()}>
        {busy ? "Andere Geräte werden abgemeldet …" : "Andere Geräte abmelden"}
      </button>
    </div>
  );
}
