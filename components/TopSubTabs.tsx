"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TopSubTabsProps = {
  items: Array<{ label: string; href: string }>;
};

export default function TopSubTabs({ items }: TopSubTabsProps) {
  const pathname = usePathname();

  return (
    <div className="mt-4 flex flex-wrap gap-4">
      {items.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex min-w-[180px] justify-center rounded-full border px-8 py-3 text-base font-semibold ${
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