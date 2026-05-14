"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  label: string;
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

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: HomeIcon },
  {
    label: "Training",
    href: "/Weekly-Workout",
    matches: ["/Weekly-Workout", "/workouts", "/training"],
    icon: TrainingIcon,
  },
  {
    label: "Fortschritt",
    href: "/stats",
    matches: ["/stats", "/level", "/review"],
    icon: StatsIcon,
  },
  { label: "Profil", href: "/profile", icon: ProfileIcon },
];

function isItemActive(itemHref: string, matches: string[] | undefined, pathname: string) {
  if (pathname === itemHref) return true;
  if (!matches) return false;
  return matches.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function BottomNav({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname() ?? "";

  if (pathname.startsWith("/login")) return null;

  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      <div className="bottom-nav__inner">
        {navItems.map((item) => {
          const isActive = isItemActive(item.href, item.matches, pathname);
          const requiresAuth = item.href !== "/dashboard";
          const isLocked = !isAuthenticated && requiresAuth;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-disabled={isLocked}
              aria-current={isActive ? "page" : undefined}
              className={`bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""} ${
                isLocked ? "bottom-nav__item--locked" : ""
              }`}
              onClick={(event) => {
                if (!isLocked) return;
                event.preventDefault();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
