"use client";

import AppCard from "@/components/AppCard";
import type { CoachingRecommendation } from "@/lib/basketball-coaching";

type Props = {
  title?: string;
  recommendations: CoachingRecommendation[];
  windowDays?: number;
  compact?: boolean;
  /** Kein AppCard-Rahmen — für eingebettete Sektionen (z. B. Review) mit eigenem Gradient-Hintergrund. */
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

  const titleClass = embedded ? "text-base font-semibold tracking-tight text-cyan-100" : `font-semibold text-cyan-100 ${compact ? "text-sm" : "text-base"}`;
  const listClass = embedded ? "mt-4 grid gap-3 sm:grid-cols-2" : `mt-3 space-y-2 ${compact ? "text-xs" : "text-sm"}`;
  const itemClass = embedded
    ? "rounded-xl border border-cyan-800/40 bg-gradient-to-br from-cyan-950/45 via-zinc-950/80 to-black/30 px-4 py-3 text-sm shadow-sm shadow-black/20"
    : "rounded-xl border border-zinc-800 bg-black/30 px-3 py-2";

  const body = (
    <>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className={titleClass}>{title}</h2>
        {windowDays ? (
          <p className={`text-xs ${embedded ? "text-cyan-200/70" : "text-zinc-500"}`}>Basis: letzte {windowDays} Tage</p>
        ) : null}
      </div>
      <ul className={listClass}>
        {recommendations.map((item) => (
          <li key={item.id} className={itemClass}>
            <p className="font-medium text-zinc-50">{item.title}</p>
            <p className={`mt-1 ${embedded ? "text-xs leading-relaxed text-zinc-400" : "text-zinc-400"}`}>{item.detail}</p>
          </li>
        ))}
      </ul>
    </>
  );

  if (embedded) {
    return <div className="text-white">{body}</div>;
  }

  return (
    <AppCard variant={compact ? "default" : "elevated"} className={compact ? "mt-3" : "mt-6"}>
      {body}
    </AppCard>
  );
}
