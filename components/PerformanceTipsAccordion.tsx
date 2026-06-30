"use client";

import type { PerformanceTip } from "@/lib/performance-tips";
import { orderedSubcategoryKeys, partitionTipsForDisplay } from "@/lib/performance-tips";

type BasketballMode = "basketball_training" | "game_training" | "game";

type Props = {
  tips: PerformanceTip[];
  basketballMode: BasketballMode;
  className?: string;
};

function generalSectionLabel(mode: BasketballMode): string {
  if (mode === "game" || mode === "game_training") return "Spielnotizen";
  return "Basketball-Training";
}

export default function PerformanceTipsAccordion({ tips, basketballMode, className }: Props) {
  const { general, bySubcategory } = partitionTipsForDisplay(tips);
  const subKeys = orderedSubcategoryKeys(Array.from(bySubcategory.keys()));
  const openSingleSubOnly = general.length === 0 && subKeys.length === 1;

  return (
    <div className={className}>
      {general.length > 0 ? (
        <details open className="group mb-2 list-card p-3">
          <summary className="cursor-pointer text-sm font-semibold text-strong">{generalSectionLabel(basketballMode)}</summary>
          <ul className="mt-2 space-y-2 pl-1 text-sm text-muted">
            {general.map((tip) => (
              <li key={tip.id}>
                <span className="font-medium text-strong">{tip.title}:</span> {tip.content}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {subKeys.map((key) => {
        const list = bySubcategory.get(key) ?? [];
        return (
          <details key={key} className="group mb-2 list-card p-3" open={openSingleSubOnly}>
            <summary className="cursor-pointer text-sm font-semibold text-strong">{key}</summary>
            <ul className="mt-2 space-y-2 pl-1 text-sm text-muted">
              {list.map((tip) => (
                <li key={tip.id}>
                  <span className="font-medium text-strong">{tip.title}:</span> {tip.content}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
