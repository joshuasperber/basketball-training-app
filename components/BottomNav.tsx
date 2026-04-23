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
  { label: "Fortschritt", href: "/stats" },
  { label: "Profile", href: "/profile" },
];

const uniqueNavItems = Array.from(new Map(navItems.map((item) => [item.href, item])).values());

export default function BottomNav({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-700 bg-zinc-900/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl justify-around px-3 py-4 text-base">
        {uniqueNavItems.map((item) => {
          const isActive = pathname === item.href;
          const requiresAuth = item.href !== "/dashboard";
          const isLocked = !isAuthenticated && requiresAuth;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-disabled={isLocked}
              className={`min-w-[72px] rounded-lg px-2 py-2 text-center ${
                isActive ? "bg-zinc-800 font-semibold text-white" : "text-zinc-300"
              } ${isLocked ? "cursor-not-allowed opacity-50" : ""}`}
              onClick={(event) => {
                if (!isLocked) return;
                event.preventDefault();
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}