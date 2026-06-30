import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  eyebrowTone?: "brand" | "violet";
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  badge?: ReactNode;
};

export default function PageHeader({ eyebrow, eyebrowTone = "brand", title, subtitle, actions, badge }: PageHeaderProps) {
  const eyebrowClass =
    eyebrowTone === "violet" ? "page-eyebrow page-eyebrow--violet" : "page-eyebrow page-eyebrow--brand";

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className={eyebrowClass}>{eyebrow}</p> : null}
        <div className="flex items-center gap-3">
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
