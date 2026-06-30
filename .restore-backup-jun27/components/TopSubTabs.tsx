"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TopSubTabsProps = {
  items: Array<{ label: string; href: string }>;
};

export default function TopSubTabs({ items }: TopSubTabsProps) {
  const pathname = usePathname();

  return (
    <div className="top-tabs">
      {items.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`top-tabs__btn ${isActive ? "top-tabs__btn--active" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
