"use client";

import Link from "next/link";
import { downloadFullUserExport, deleteAccountAndLocalData } from "@/lib/account-data";

type ProfilePrivacySectionProps = {
  onFeedback: (message: string, tone: "success" | "error" | "info") => void;
};

export default function ProfilePrivacySection({ onFeedback }: ProfilePrivacySectionProps) {
  return (
    <section className="app-card">
      <p className="section-eyebrow">Datenschutz</p>
      <h2 className="section-title mt-1">Deine Daten</h2>
      <p className="mt-2 text-sm text-muted">
        Export (Art. 20 DSGVO) oder Löschung von Cloud-Konto und lokalen Browser-Daten.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void downloadFullUserExport()}>
          Alle Daten exportieren (JSON)
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm text-rose-600"
          onClick={async () => {
            const confirmed = window.confirm(
              "Konto und alle Cloud-Daten unwiderruflich löschen? Lokale Browser-Daten werden ebenfalls geleert.",
            );
            if (!confirmed) return;
            const typed = window.prompt('Zur Bestätigung "DELETE" eingeben:');
            if (typed !== "DELETE") {
              onFeedback("Löschung abgebrochen.", "info");
              return;
            }
            const result = await deleteAccountAndLocalData();
            onFeedback(result.message, result.ok ? "success" : "error");
          }}
        >
          Konto &amp; Cloud-Daten löschen
        </button>
      </div>
      <nav className="mt-5 flex flex-col gap-2 border-t border-[var(--surface-border)] pt-4 text-sm">
        <Link href="/datenschutz" className="text-muted underline-offset-2 hover:text-strong hover:underline">
          Datenschutzerklärung
        </Link>
        <Link href="/nutzungsbedingungen" className="text-muted underline-offset-2 hover:text-strong hover:underline">
          Nutzungsbedingungen
        </Link>
        <Link href="/impressum" className="text-muted underline-offset-2 hover:text-strong hover:underline">
          Impressum
        </Link>
      </nav>
    </section>
  );
}
