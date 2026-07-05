import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  eyebrowTone?: "brand" | "violet";
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  badge?: ReactNode;
  /** stack = Buttons untereinander; top-right = Aktion oben rechts (Profil) */
  actionsLayout?: "default" | "stack" | "top-right";
};

export default function PageHeader({
  eyebrow,
  eyebrowTone = "brand",
  title,
  subtitle,
  actions,
  badge,
  actionsLayout = "default",
}: PageHeaderProps) {
  const eyebrowClass =
    eyebrowTone === "violet" ? "page-eyebrow page-eyebrow--violet" : "page-eyebrow page-eyebrow--brand";

  const actionsClass =
    actionsLayout === "stack"
      ? "page-header__actions page-header__actions--stack"
      : actionsLayout === "top-right"
        ? "page-header__actions"
        : "flex flex-wrap items-center gap-2";

  const headerClass =
    actionsLayout === "top-right" ? "page-header page-header--top-right" : "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between";

  return (
    <header className={headerClass}>
      <div className={actionsLayout === "top-right" ? "page-header__main" : undefined}>
        {eyebrow ? <p className={eyebrowClass}>{eyebrow}</p> : null}
        <div className="flex items-center gap-3">
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className={actionsClass}>{actions}</div> : null}
    </header>
  );
}
