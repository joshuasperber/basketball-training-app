"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/I18nProvider";

const LEGAL_ON_PROFILE_PREFIXES = ["/profile", "/datenschutz", "/impressum", "/nutzungsbedingungen"];

export default function AppFooter() {
  const pathname = usePathname() ?? "";
  const t = useT();

  if (LEGAL_ON_PROFILE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return null;
  }

  return (
    <footer className="border-t border-white/5 px-4 py-6 text-center text-xs text-faint">
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <Link href="/datenschutz" className="hover:text-muted">
          {t("privacy.linkPrivacy")}
        </Link>
        <Link href="/impressum" className="hover:text-muted">
          {t("privacy.linkImprint")}
        </Link>
        <Link href="/nutzungsbedingungen" className="hover:text-muted">
          {t("privacy.linkTerms")}
        </Link>
        <Link href="/profile" className="hover:text-muted">
          {t("nav.profile")}
        </Link>
      </nav>
      <p className="mt-2">{t("footer.tagline")}</p>
    </footer>
  );
}
