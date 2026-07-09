"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/I18nProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { WEEKLY_WORKOUT_PATH } from "@/lib/routes";

type TopSubTabsProps = {
  items: Array<{ labelKey: MessageKey; href: string }>;
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

function tabAccentClass(href: string, variant: TopSubTabsProps["variant"]) {
  if (variant !== "team-liga") return "";
  const path = normalizeTabPath(href);
  if (path === "/team") return "top-tabs__btn--team";
  if (path === "/liga") return "top-tabs__btn--liga";
  return "";
}

export default function TopSubTabs({ items, variant = "default", className = "" }: TopSubTabsProps) {
  const pathname = usePathname();
  const t = useT();

  return (
    <div className={`top-tabs-wrap ${className}`.trim()}>
      <div
        className={`top-tabs ${
          variant === "team-liga" ? "top-tabs--team-liga" : variant === "training" ? "top-tabs--training" : ""
        }`.trim()}
      >
        {items.map((item) => {
          const label = t(item.labelKey);
          const isActive = isTabActive(pathname, item.href);
          const href = item.href === "/weekly-workout" || item.href === "/Weekly-Workout" ? WEEKLY_WORKOUT_PATH : item.href;
          const accent = tabAccentClass(item.href, variant);
          return (
            <Link
              key={item.labelKey}
              href={href}
              className={`top-tabs__btn ${isActive ? `top-tabs__btn--active ${accent}`.trim() : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
