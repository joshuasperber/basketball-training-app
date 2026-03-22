"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { name: "Home", href: "/" },
  { name: "Dashboard", href: "/dashboard" },
  { name: "Training", href: "/training" },
  { name: "Stats", href: "/stats" },
  { name: "Profile", href: "/profile" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-900">
      <div className="mx-auto flex max-w-md justify-around py-3 text-sm">
        {navItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={isActive ? "font-semibold text-white" : "text-zinc-400"}
            >
              {item.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}