import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { legalConfig, isLegalConfigComplete } from "@/lib/legal-config";

export default function ImpressumPage() {
  return (
    <main className="app-container animate-in pb-24">
      <PageHeader eyebrow="Rechtliches" title="Impressum" subtitle="Angaben gemäß § 5 TMG / § 18 MStV." />

      {!isLegalConfigComplete() ? (
        <p className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Platzhalter aktiv — trage deine Daten in <code className="text-xs">lib/legal-config.ts</code> ein.
        </p>
      ) : null}

      <section className="mt-6 app-card space-y-4 text-sm text-muted">
        <div>
          <h2 className="font-semibold text-strong">Anbieter</h2>
          <p className="mt-1 whitespace-pre-line">{legalConfig.operatorName}</p>
          <p className="mt-1 whitespace-pre-line">{legalConfig.operatorAddress}</p>
        </div>
        <div>
          <h2 className="font-semibold text-strong">Kontakt</h2>
          <p className="mt-1">
            E-Mail:{" "}
            <a href={`mailto:${legalConfig.operatorEmail}`} className="text-indigo-300 underline">
              {legalConfig.operatorEmail}
            </a>
          </p>
          {legalConfig.operatorPhone ? <p className="mt-1">Telefon: {legalConfig.operatorPhone}</p> : null}
        </div>
        {legalConfig.operatorRegister ? (
          <div>
            <h2 className="font-semibold text-strong">Register / USt</h2>
            <p className="mt-1">{legalConfig.operatorRegister}</p>
          </div>
        ) : null}
        {legalConfig.contentResponsible ? (
          <div>
            <h2 className="font-semibold text-strong">Verantwortlich für den Inhalt</h2>
            <p className="mt-1">{legalConfig.contentResponsible}</p>
          </div>
        ) : null}
        <div>
          <h2 className="font-semibold text-strong">Haftung für Inhalte</h2>
          <p className="mt-1">
            Die Trainings- und Coaching-Inhalte dienen der allgemeinen Fitness und ersetzen keine medizinische Beratung.
            Nutzung auf eigene Verantwortung.
          </p>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/datenschutz" className="btn btn-ghost btn-sm">
          Datenschutz
        </Link>
        <Link href="/nutzungsbedingungen" className="btn btn-ghost btn-sm">
          Nutzungsbedingungen
        </Link>
      </div>
    </main>
  );
}
