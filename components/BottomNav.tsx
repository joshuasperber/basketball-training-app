"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { fetchAuthMe } from "@/lib/auth-session-align";
import { useT } from "@/lib/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { hasOfflineSessionHint } from "@/lib/offline-session";
import { WEEKLY_WORKOUT_PATH } from "@/lib/routes";

type NavItem = {
  labelKey: MessageKey;
  href: string;
  matches?: string[];
  icon: ReactNode;
};

const HomeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
  </svg>
);

const TrainingIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18" />
    <path d="M3.2 12h17.6" />
    <path d="M5.2 6.8c2.8 1.1 5.5 2.6 6.8 5.2 1.3 2.6 4 4.1 6.8 5.2" />
    <path d="M18.8 6.8c-2.8 1.1-5.5 2.6-6.8 5.2-1.3 2.6-4 4.1-6.8 5.2" />
  </svg>
);

const StatsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-8" />
    <path d="M22 20H2" />
  </svg>
);

const ProfileIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

const TeamIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M4 20a5 5 0 0 1 10 0" />
    <path d="M14 20a4 4 0 0 1 7 0" />
  </svg>
);

const navItems: NavItem[] = [
  { labelKey: "nav.home", href: "/dashboard", icon: HomeIcon },
  {
    labelKey: "nav.training",
    href: WEEKLY_WORKOUT_PATH,
    matches: [WEEKLY_WORKOUT_PATH, "/Weekly-Workout", "/workouts", "/training"],
    icon: TrainingIcon,
  },
  { labelKey: "nav.team", href: "/team", matches: ["/team", "/liga"], icon: TeamIcon },
  {
    labelKey: "nav.stats",
    href: "/stats",
    matches: ["/stats", "/level", "/review"],
    icon: StatsIcon,
  },
  { labelKey: "nav.profile", href: "/profile", icon: ProfileIcon },
];
function isItemActive(itemHref: string, matches: string[] | undefined, pathname: string) {
  if (pathname === itemHref) return true;
  if (!matches) return false;
  return matches.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function BottomNav({ isAuthenticated: initialAuthenticated }: { isAuthenticated: boolean }) {
  const t = useT();
  const pathname = usePathname() ?? "";
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => initialAuthenticated || (typeof window !== "undefined" && hasOfflineSessionHint()),
  );
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const syncOffline = () => setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    syncOffline();
    window.addEventListener("online", syncOffline);
    window.addEventListener("offline", syncOffline);
    return () => {
      window.removeEventListener("online", syncOffline);
      window.removeEventListener("offline", syncOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshAuth = () => {
      void fetchAuthMe().then((me) => {
        if (cancelled) return;
        if (me) {
          setIsAuthenticated(true);
          return;
        }
        if (!navigator.onLine) {
          setIsAuthenticated((current) => current || initialAuthenticated || hasOfflineSessionHint());
          return;
        }
        setIsAuthenticated(false);
      });
    };

    refreshAuth();
    window.addEventListener("online", refreshAuth);

    return () => {
      cancelled = true;
      window.removeEventListener("online", refreshAuth);
    };
  }, [initialAuthenticated]);

  if (pathname.startsWith("/login")) return null;

  return (
    <nav className="bottom-nav" aria-label={t("nav.aria")}>
      <div
        className="bottom-nav__inner grid w-full max-w-[56rem] grid-cols-5 mx-auto px-0.5 pt-2 pb-2.5 gap-0"
        style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
      >
        {navItems.map((item) => {
          const label = t(item.labelKey);
          const isActive = isItemActive(item.href, item.matches, pathname);
          const requiresAuth = item.href !== "/dashboard";
          const isLocked =
            !isAuthenticated && requiresAuth && !offline && !hasOfflineSessionHint();

          return (
            <Link
              key={item.href}
              href={isLocked ? "/login?next=" + encodeURIComponent(item.href) : item.href}
              title={label}
              aria-label={label}
              aria-disabled={isLocked}
              aria-current={isActive ? "page" : undefined}
              className={`bottom-nav__item flex min-w-0 w-full flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 ${isActive ? "bottom-nav__item--active" : ""} ${
                isLocked ? "bottom-nav__item--locked" : ""
              }`}
            >
              {item.icon}
              <span className="bottom-nav__label block w-full truncate text-center text-[0.56rem] font-semibold leading-tight sm:text-[0.62rem]">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
