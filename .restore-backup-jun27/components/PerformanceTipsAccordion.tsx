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
  if (mode === "game") return "Spieltag";
  if (mode === "game_training") return "Spieltraining (allgemein)";
  return "Basketball (allgemein)";
}

export default function PerformanceTipsAccordion({ tips, basketballMode, className }: Props) {
  const { general, bySubcategory } = partitionTipsForDisplay(tips);
  const subKeys = orderedSubcategoryKeys(Array.from(bySubcategory.keys()));
  const openSingleSubOnly = general.length === 0 && subKeys.length === 1;

  return (
    <div className={className}>
      {general.length > 0 ? (
        <details open className="group mb-2 rounded-lg border border-cyan-800/50 bg-zinc-950/50 p-2">
          <summary className="cursor-pointer text-sm font-semibold text-cyan-200">{generalSectionLabel(basketballMode)}</summary>
          <ul className="mt-2 space-y-2 pl-1 text-sm text-cyan-50">
            {general.map((tip) => (
              <li key={tip.id}>
                <span className="font-medium text-cyan-100">{tip.title}:</span> {tip.content}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {subKeys.map((key) => {
        const list = bySubcategory.get(key) ?? [];
        return (
          <details key={key} className="group mb-2 rounded-lg border border-cyan-800/50 bg-zinc-950/50 p-2" open={openSingleSubOnly}>
            <summary className="cursor-pointer text-sm font-semibold text-cyan-200">{key}</summary>
            <ul className="mt-2 space-y-2 pl-1 text-sm text-cyan-50">
              {list.map((tip) => (
                <li key={tip.id}>
                  <span className="font-medium text-cyan-100">{tip.title}:</span> {tip.content}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
