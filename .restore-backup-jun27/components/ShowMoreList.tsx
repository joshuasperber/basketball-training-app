"use client";

import { useState, type ReactNode } from "react";

type ShowMoreListProps<T> = {
  items: T[];
  initialCount?: number;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
  className?: string;
  listClassName?: string;
  moreLabel?: (hiddenCount: number) => string;
};

export default function ShowMoreList<T>({
  items,
  initialCount = 4,
  renderItem,
  getKey,
  className = "",
  listClassName = "",
  moreLabel = (n) => `Mehr anzeigen (${n})`,
}: ShowMoreListProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, initialCount);
  const hiddenCount = Math.max(0, items.length - initialCount);

  if (items.length === 0) return null;

  return (
    <div className={className}>
      <div className={listClassName}>{visible.map((item, index) => renderItem(item, index))}</div>
      {!expanded && hiddenCount > 0 ? (
        <button type="button" className="show-more-btn mt-2 w-full" onClick={() => setExpanded(true)}>
          {moreLabel(hiddenCount)}
        </button>
      ) : null}
    </div>
  );
}
