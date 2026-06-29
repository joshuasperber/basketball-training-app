"use client";

import GradientFadeList from "@/components/GradientFadeList";
import type { CoachingRecommendation } from "@/lib/basketball-coaching";

type Props = {
  title?: string;
  recommendations: CoachingRecommendation[];
  windowDays?: number;
  compact?: boolean;
  /** Kein AppCard-Rahmen — für eingebettete Sektionen (z. B. Review) mit eigenem Hintergrund. */
  embedded?: boolean;
};

export default function BasketballCoachingCard({
  title = "Basketball-Empfehlungen",
  recommendations,
  windowDays,
  compact = false,
  embedded = false,
}: Props) {
  if (recommendations.length === 0) return null;

  const titleClass = embedded
    ? "text-base font-semibold tracking-tight text-strong"
    : `font-semibold text-strong ${compact ? "text-sm" : "text-base"}`;
  const itemClass = embedded
    ? "list-card"
    : "list-card";

  const body = (
    <>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className={titleClass}>{title}</h2>
        {windowDays ? (
          <p className={`text-xs ${embedded ? "text-muted" : "text-muted"}`}>Basis: letzte {windowDays} Tage</p>
        ) : null}
      </div>
      <GradientFadeList
        className={embedded ? "mt-4" : "mt-3"}
        items={recommendations}
        listClassName={embedded ? "grid gap-3 sm:grid-cols-2" : `space-y-2 ${compact ? "text-xs" : "text-sm"}`}
        getKey={(item) => item.id}
        renderItem={(item) => (
          <div className={itemClass}>
            <p className="list-card__title">{item.title}</p>
            <p className={`mt-1 ${embedded ? "text-xs leading-relaxed text-muted" : "text-muted"}`}>{item.detail}</p>
          </div>
        )}
      />
    </>
  );

  if (embedded) {
    return <div>{body}</div>;
  }

  return (
    <section className={`app-card app-card--accent-cyan ${compact ? "mt-3" : "mt-6"}`}>
      {body}
    </section>
  );
}
