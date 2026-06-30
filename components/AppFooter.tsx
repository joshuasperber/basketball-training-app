"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LEGAL_ON_PROFILE_PREFIXES = ["/profile", "/datenschutz", "/impressum", "/nutzungsbedingungen"];

export default function AppFooter() {
  const pathname = usePathname() ?? "";

  if (LEGAL_ON_PROFILE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return null;
  }

  return (
    <footer className="border-t border-white/5 px-4 py-6 text-center text-xs text-faint">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <Link href="/datenschutz" className="hover:text-muted">
          Datenschutz
        </Link>
        <Link href="/impressum" className="hover:text-muted">
          Impressum
        </Link>
        <Link href="/nutzungsbedingungen" className="hover:text-muted">
          Nutzungsbedingungen
        </Link>
        <Link href="/profile" className="hover:text-muted">
          Profil
        </Link>
      </nav>
      <p className="mt-2">Basketball Training App · Daten lokal &amp; optional in der Cloud</p>
    </footer>
  );
}
