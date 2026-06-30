"use client";

import { Fragment, useId, useState, type ReactNode } from "react";

export type GradientFadeListProps<T> = {
  items: T[];
  previewCount?: number;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
  className?: string;
  listClassName?: string;
  showMoreLabel?: (hiddenCount: number) => string;
  showLessLabel?: string;
};

export default function GradientFadeList<T>({
  items,
  previewCount = 3,
  renderItem,
  getKey,
  className = "",
  listClassName = "",
  showMoreLabel = (hiddenCount) => `Mehr anzeigen (${hiddenCount})`,
  showLessLabel = "Weniger anzeigen",
}: GradientFadeListProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hasMore = items.length > previewCount;
  const hiddenCount = Math.max(0, items.length - previewCount);

  if (items.length === 0) return null;

  const visibleCount = expanded || !hasMore ? items.length : Math.min(items.length, previewCount + 1);
  const visible = items.slice(0, visibleCount);

  return (
    <div className={className}>
      <div className={`gradient-fade-list ${!expanded && hasMore ? "gradient-fade-list--preview" : ""}`}>
        <div id={listId} className={`gradient-fade-list__items ${listClassName}`} aria-live="polite">
          {visible.map((item, index) => (
            <Fragment key={getKey(item, index)}>{renderItem(item, index)}</Fragment>
          ))}
        </div>
        {!expanded && hasMore ? <div className="gradient-fade-list__fade" aria-hidden="true" /> : null}
      </div>

      {hasMore ? (
        <button
          type="button"
          className="show-more-btn mt-2 w-full"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? showLessLabel : showMoreLabel(hiddenCount)}
        </button>
      ) : null}
    </div>
  );
}
