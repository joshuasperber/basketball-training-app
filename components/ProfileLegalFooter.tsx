import Link from "next/link";

/** Rechtliche Links — am Ende der Profil-Seite (unter dem Profil-Reiter). */
export default function ProfileLegalFooter() {
  return (
    <footer className="mt-8 border-t border-white/10 pt-6 pb-4 text-center">
      <p className="section-eyebrow">Rechtliches</p>
      <nav className="mt-3 flex flex-col items-center gap-2.5 text-sm">
        <Link href="/nutzungsbedingungen" className="text-muted underline-offset-2 hover:text-strong hover:underline">
          Nutzungsbedingungen
        </Link>
        <Link href="/impressum" className="text-muted underline-offset-2 hover:text-strong hover:underline">
          Impressum
        </Link>
        <Link href="/datenschutz" className="text-muted underline-offset-2 hover:text-strong hover:underline">
          Datenschutz
        </Link>
      </nav>
      <p className="mt-5 text-xs text-faint">Basketball Training App · Daten lokal &amp; optional in der Cloud</p>
    </footer>
  );
}
