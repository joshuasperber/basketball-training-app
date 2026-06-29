"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WEEKLY_WORKOUT_PATH } from "@/lib/routes";

type TopSubTabsProps = {
  items: Array<{ label: string; href: string }>;
};

function normalizeTabPath(path: string) {
  const base = path.split("?")[0]?.split("#")[0] ?? path;
  if (base === "/Weekly-Workout" || base === "/weekly-workout") {
    return WEEKLY_WORKOUT_PATH;
  }
  return base;
}

function isTabActive(pathname: string, href: string) {
  return normalizeTabPath(pathname) === normalizeTabPath(href);
}

export default function TopSubTabs({ items }: TopSubTabsProps) {
  const pathname = usePathname();

  return (
    <div className="top-tabs-wrap">
      <div className="top-tabs">
        {items.map((item) => {
          const isActive = isTabActive(pathname, item.href);
          const href = item.label === "Weekly" ? WEEKLY_WORKOUT_PATH : item.href;
          return (
            <Link
              key={item.label}
              href={href}
              className={`top-tabs__btn ${isActive ? "top-tabs__btn--active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
