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
    <header className="page-header">
      <div className="page-header__main">
        {eyebrow ? <p className={eyebrowClass}>{eyebrow}</p> : null}
        <div className="flex items-center gap-3">
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
