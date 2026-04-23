"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TopSubTabsProps = {
  items: Array<{ label: string; href: string }>;
};

export default function TopSubTabs({ items }: TopSubTabsProps) {
  const pathname = usePathname();

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full border px-3 py-1 text-xs ${
              isActive
                ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                : "border-zinc-600 text-zinc-300"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}