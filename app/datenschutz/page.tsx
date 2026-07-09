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
        <p className="text-xs text-faint">Stand: {legalConfig.privacyPolicyDate}</p>

        <div>
          <h2 className="font-semibold text-strong">Verantwortlicher</h2>
          <p className="mt-1">
            {legalConfig.operatorName}
            <br />
            {legalConfig.operatorAddress}
            <br />
            E-Mail:{" "}
            <a href={`mailto:${legalConfig.operatorEmail}`} className="text-[var(--brand-400)] underline">
              {legalConfig.operatorEmail}
            </a>
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-strong">Welche Daten werden verarbeitet?</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Login: E-Mail-Adresse (Supabase Auth)</li>
            <li>Profil: Name, Username, Position, Körperdaten, Wochen-Verfügbarkeit</li>
            <li>Training: Workout-Logs, RPE, XP, Spiel-Statistiken, Coach-Intake</li>
            <li>Team (optional): Anzeigename, Form-Score, Freigabe-Stufe, ggf. E-Mail für Teammitglieder</li>
            <li>Spiel-Fotos (optional): Upload in Supabase Storage (Bucket „game-photos“)</li>
            <li>Eigene Übungs-Videos können lokal im Browser gespeichert werden</li>
            <li>Technisch: Session-Cookies, Service-Worker-Cache, optional Sentry-Fehlerberichte</li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold text-strong">Rechtsgrundlagen (Art. 6 DSGVO)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Vertrag (Art. 6 Abs. 1 lit. b):</strong> Konto, Cloud-Sync, Team-Funktionen
            </li>
            <li>
              <strong>Einwilligung (Art. 6 Abs. 1 lit. a):</strong> KI-Coach, Push-Benachrichtigungen,
              optional Sentry-Diagnostik
            </li>
            <li>
              <strong>Berechtigtes Interesse (Art. 6 Abs. 1 lit. f):</strong> Betrieb, Sicherheit, Stabilität
              (soweit ohne Einwilligung zulässig)
            </li>
          </ul>
          <p className="mt-2">
            RPE, Körpermaße und Verletzungs-/Schonhinweise dienen der Trainingssteuerung und stellen{" "}
            <em>keine</em> medizinische Diagnose dar. Soweit diese Angaben als besondere Kategorien
            personenbezogener Daten (Art. 9 DSGVO) gelten können, erfolgt die Verarbeitung nur zur
            Bereitstellung der von dir angeforderten Trainingsfunktionen bzw. mit deiner Einwilligung.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-strong">Speicherorte</h2>
          <p className="mt-1">
            Daten liegen primär lokal im Browser (<code className="text-xs">localStorage</code>) und werden bei
            Login mit Supabase synchronisiert (Tabelle <code className="text-xs">user_progress</code>,{" "}
            <code className="text-xs">profiles</code>).
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-strong">Dienstleister (Auftragsverarbeiter)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Supabase</strong> — Auth, Datenbank, Dateispeicher
            </li>
            <li>
              <strong>Vercel</strong> — Hosting der App
            </li>
            <li>
              <strong>Sentry</strong> — Fehler- und Performance-Berichte (nur nach Einwilligung)
            </li>
            <li>
              <strong>Groq / OpenAI</strong> — KI-Coach (nur nach Einwilligung; Verarbeitung u. a. in den USA
              auf Basis von Standardvertragsklauseln)
            </li>
            <li>
              <strong>Ball Dont Lie</strong> — NBA-Spielergebnisse für den News-Bereich (serverseitig, ohne deine
              Profildaten)
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold text-strong">Cookies &amp; Sentry</h2>
          <p className="mt-1">
            Session-Cookies (<code className="text-xs">sb-access-token</code>,{" "}
            <code className="text-xs">sb-refresh-token</code>) sind technisch notwendig für die Anmeldung (HttpOnly).
            Wenn <code className="text-xs">SENTRY_DSN</code> gesetzt ist, werden nach deiner Einwilligung
            anonymisierte Fehler- und Performance-Berichte an Sentry übermittelt — ohne Klartext-E-Mails oder Tokens.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-strong">KI-Coach</h2>
          <p className="mt-1">
            Mit Einwilligung im Profil senden wir Profil-, Trainings-, Spiel- und optional Intake-Daten an Groq oder
            OpenAI, um Empfehlungen zu erzeugen. Automatische Wochenplan-Updates per KI erfolgen nur mit
            Einwilligung. Du kannst die Einwilligung jederzeit im Profil widerrufen.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-strong">PWA, Service Worker &amp; Benachrichtigungen</h2>
          <p className="mt-1">
            Die App kann als PWA installiert werden. Ein Service Worker cached technische App-Dateien für Offline-Nutzung.
            Trainings-Erinnerungen nutzen die Browser-Benachrichtigungs-API — nur nach deiner Freigabe in den
            Geräteeinstellungen.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-strong">Speicherdauer</h2>
          <p className="mt-1">
            Kontodaten bis zur Löschung im Profil. Lokale Browser-Daten bis du sie löschst oder den Browser leerst.
            Sentry-Logs gemäß Anbieter-Richtlinie. KI-Antwort-Cache serverseitig max. 24 Stunden.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-strong">Deine Rechte (DSGVO)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Auskunft &amp; Export: Profil → „Alle Daten exportieren“</li>
            <li>Löschung: Profil → „Konto &amp; Cloud-Daten löschen“</li>
            <li>Widerruf: Einwilligungen (KI, Sentry) im Profil bzw. Cookie-Banner</li>
            <li>Abmeldung löscht Session-Cookies; Cloud-Daten bleiben bis zur Löschung erhalten</li>
          </ul>
          <p className="mt-2">
            Nach Kontolöschung können technische Log-Einträge bei Dienstleistern (z. B. Sentry) noch kurzzeitig
            bestehen bleiben.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-strong">Beschwerderecht</h2>
          <p className="mt-1">
            Du hast das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, z. B. bei der Berliner
            Beauftragte für Datenschutz und Informationsfreiheit, Friedrichstraße 219, 10969 Berlin.
          </p>
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
