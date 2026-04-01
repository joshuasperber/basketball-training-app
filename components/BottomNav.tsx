"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Training", href: "/training" },
  { label: "Weekly", href: "/Weekly-Workout" },
  { label: "Stats", href: "/stats" },
  { label: "Level", href: "/level" },
  { label: "Profile", href: "/profile" },
];

const uniqueNavItems = Array.from(new Map(navItems.map((item) => [item.href, item])).values());

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-900">
      <div className="mx-auto flex max-w-md justify-around py-3 text-sm">
        {uniqueNavItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={isActive ? "font-semibold text-white" : "text-zinc-400"}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}