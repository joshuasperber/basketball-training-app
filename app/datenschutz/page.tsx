import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { legalConfig } from "@/lib/legal-config";

export default function DatenschutzPage() {
  return (
    <main className="app-container animate-in pb-24">
      <PageHeader
        eyebrow="Rechtliches"
        title="Datenschutz"
        subtitle="Informationen zur Verarbeitung personenbezogener Daten in dieser App."
      />

      <section className="mt-6 app-card space-y-4 text-sm text-muted">
        <div>
          <h2 className="font-semibold text-strong">Verantwortlicher</h2>
          <p className="mt-1">
            {legalConfig.operatorName}
            <br />
            {legalConfig.operatorAddress}
            <br />
            E-Mail:{" "}
            <a href={`mailto:${legalConfig.operatorEmail}`} className="text-indigo-300 underline">
              {legalConfig.operatorEmail}
            </a>
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-strong">Welche Daten werden verarbeitet?</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Login: E-Mail-Adresse (Supabase Auth)</li>
            <li>Profil: Name, Position, Körperdaten, Wochen-Verfügbarkeit</li>
            <li>Training: Workout-Logs, XP, Spiel-Statistiken, Coach-Intake</li>
            <li>Team (optional): Anzeigename, Form-Score, Freigabe-Stufe</li>
            <li>Technisch: Session-Cookies, optional Sentry-Fehlerberichte</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold text-strong">Speicherorte</h2>
          <p className="mt-1">
            Daten liegen primär lokal im Browser (<code className="text-xs">localStorage</code>) und werden bei
            Login mit Supabase synchronisiert (Tabelle <code className="text-xs">user_progress</code>).
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-strong">Cookies &amp; Sentry</h2>
          <p className="mt-1">
            Session-Cookies (<code className="text-xs">sb-access-token</code>,{" "}
            <code className="text-xs">sb-refresh-token</code>) sind technisch notwendig für die Anmeldung (HttpOnly).
            Wenn <code className="text-xs">SENTRY_DSN</code> gesetzt ist, werden anonymisierte Fehlerberichte an Sentry
            übermittelt — ohne Klartext-E-Mails oder Tokens.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-strong">Deine Rechte (DSGVO)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Auskunft &amp; Export: Profil → „Alle Daten exportieren“</li>
            <li>Löschung: Profil → „Konto &amp; Cloud-Daten löschen“</li>
            <li>Widerruf: Abmeldung löscht Session-Cookies; Cloud-Daten bleiben bis zur Löschung erhalten</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold text-strong">Team-Freigabe</h2>
          <p className="mt-1">
            Im Team-Modus kannst du steuern, ob andere nur eine Zusammenfassung (Form-Score, Aktivitätszahlen) oder
            volle Details sehen. Wochenpläne werden nur bei „Volles Teilen“ für Teammitglieder angezeigt.
          </p>
        </div>
      </section>

      <div className="mt-6">
        <Link href="/profile" className="btn btn-ghost btn-sm">
          ← Zurück zum Profil
        </Link>
      </div>
    </main>
  );
}
