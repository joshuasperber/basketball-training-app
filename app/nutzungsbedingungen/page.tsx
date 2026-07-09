import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { legalConfig } from "@/lib/legal-config";

export default function NutzungsbedingungenPage() {
  return (
    <main className="app-container animate-in pb-24">
      <PageHeader
        eyebrow="Rechtliches"
        title="Nutzungsbedingungen"
        subtitle="Grundregeln für die Nutzung der Basketball Training App."
      />

      <section className="mt-6 app-card space-y-4 text-sm text-muted">
        <div>
          <h2 className="font-semibold text-strong">1. Geltungsbereich</h2>
          <p className="mt-1">
            Diese Bedingungen gelten für die Nutzung der App von {legalConfig.operatorName}. Mit Registrierung oder
            Nutzung stimmst du ihnen zu.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-strong">2. Kein medizinischer Rat</h2>
          <p className="mt-1">
            Trainingspläne, KI-Coach-Hinweise und Statistiken sind keine medizinische Beratung. Bei Verletzungen,
            Erkrankungen oder Schmerzen konsultiere eine Ärztin/einen Arzt, bevor du trainierst.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-strong">3. KI-Coach</h2>
          <p className="mt-1">
            Automatisierte Empfehlungen können fehlerhaft sein. Du entscheidest selbst über Belastung und Ausführung.
            Profil- und Intake-Daten können an konfigurierte KI-Dienste (z. B. Groq/OpenAI) übermittelt werden — siehe{" "}
            <Link href="/datenschutz" className="text-[var(--brand-400)] underline">
              Datenschutz
            </Link>
            .
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-strong">4. Account &amp; Daten</h2>
          <p className="mt-1">
            Du bist für die Richtigkeit deiner Angaben verantwortlich. Export und Löschung findest du im Profil unter
            „Deine Daten“.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-strong">5. Verfügbarkeit</h2>
          <p className="mt-1">
            Die App wird „wie besehen“ bereitgestellt. Cloud-Sync und KI-Features hängen von Drittanbietern ab und können
            ausfallen.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-strong">6. Mindestalter</h2>
          <p className="mt-1">
            Die App richtet sich an Nutzer ab 16 Jahren. Jüngere Personen dürfen die App nur mit Zustimmung der
            Erziehungsberechtigten nutzen. Mit Registrierung bestätigst du, dass du diese Voraussetzung erfüllst.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-strong">7. Nutzerinhalte</h2>
          <p className="mt-1">
            Hochgeladene Inhalte (z. B. Spiel-Fotos) bleiben dein Eigentum. Du räumst uns das Recht ein, sie zur
            Bereitstellung der App zu speichern und dir anzuzeigen. Keine Weitergabe an Dritte zu Werbezwecken.
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-strong">8. Anwendbares Recht</h2>
          <p className="mt-1">Es gilt deutsches Recht. Gerichtsstand, soweit zulässig: Berlin.</p>
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
