"use client";

import GradientFadeList, { type GradientFadeListProps } from "@/components/GradientFadeList";

type ShowMoreListProps<T> = Omit<GradientFadeListProps<T>, "previewCount" | "showMoreLabel" | "showLessLabel"> & {
  /** @deprecated Use previewCount on GradientFadeList directly */
  initialCount?: number;
  moreLabel?: (hiddenCount: number) => string;
  showLessLabel?: string;
};

/** @deprecated Prefer GradientFadeList — thin wrapper for legacy call sites. */
export default function ShowMoreList<T>({
  initialCount = 3,
  moreLabel = (hiddenCount) => `Mehr anzeigen (${hiddenCount})`,
  showLessLabel = "Weniger anzeigen",
  ...props
}: ShowMoreListProps<T>) {
  return (
    <GradientFadeList
      {...props}
      previewCount={initialCount}
      showMoreLabel={moreLabel}
      showLessLabel={showLessLabel}
    />
  );
}
