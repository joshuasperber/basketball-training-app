"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WEEKLY_WORKOUT_PATH } from "@/lib/routes";

type TopSubTabsProps = {
  items: Array<{ label: string; href: string }>;
  variant?: "default" | "team-liga" | "training";
  className?: string;
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

function tabAccentClass(label: string, variant: TopSubTabsProps["variant"]) {
  if (variant !== "team-liga") return "";
  const normalized = label.trim().toLowerCase();
  if (normalized === "team") return "top-tabs__btn--team";
  if (normalized === "liga") return "top-tabs__btn--liga";
  return "";
}

export default function TopSubTabs({ items, variant = "default", className = "" }: TopSubTabsProps) {
  const pathname = usePathname();

  return (
    <div className={`top-tabs-wrap ${className}`.trim()}>
      <div
        className={`top-tabs ${
          variant === "team-liga" ? "top-tabs--team-liga" : variant === "training" ? "top-tabs--training" : ""
        }`.trim()}
      >
        {items.map((item) => {
          const isActive = isTabActive(pathname, item.href);
          const href = item.label === "Weekly" ? WEEKLY_WORKOUT_PATH : item.href;
          const accent = tabAccentClass(item.label, variant);
          return (
            <Link
              key={item.label}
              href={href}
              className={`top-tabs__btn ${isActive ? `top-tabs__btn--active ${accent}`.trim() : ""}`}
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
