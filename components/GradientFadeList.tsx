"use client";

import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type GradientFadeListProps<T> = {
  items: T[];
  /** Fully visible items before fade preview. Default: 3. Ignored when previewRows is set. */
  previewCount?: number;
  /** Collapse by visual wrap-rows instead of item count (e.g. badge chips). */
  previewRows?: number;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
  className?: string;
  listClassName?: string;
  showMoreLabel?: (hiddenCount: number) => string;
  showLessLabel?: string;
};

const ROW_TOLERANCE_PX = 6;

function measureWrapRows(el: HTMLElement, previewRows: number) {
  const children = Array.from(el.children) as HTMLElement[];
  if (children.length === 0) {
    return { overflows: false, hiddenCount: 0, maxHeight: 0 };
  }

  const styles = getComputedStyle(el);
  const gap = Number.parseFloat(styles.rowGap || styles.gap || "8") || 8;
  const rows: { top: number; height: number; count: number }[] = [];

  for (const child of children) {
    const top = child.offsetTop;
    const existing = rows.find((row) => Math.abs(row.top - top) <= ROW_TOLERANCE_PX);
    if (existing) {
      existing.count += 1;
      existing.height = Math.max(existing.height, child.offsetHeight);
    } else {
      rows.push({ top, height: child.offsetHeight, count: 1 });
    }
  }

  rows.sort((a, b) => a.top - b.top);
  const visibleRows = rows.slice(0, previewRows);
  const hiddenRows = rows.slice(previewRows);
  const maxHeight =
    visibleRows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, visibleRows.length - 1) * gap;

  return {
    overflows: hiddenRows.length > 0,
    hiddenCount: hiddenRows.reduce((sum, row) => sum + row.count, 0),
    maxHeight,
  };
}

export default function GradientFadeList<T>({
  items,
  previewCount = 3,
  previewRows,
  renderItem,
  getKey,
  className = "",
  listClassName = "",
  showMoreLabel = (hiddenCount) => `Mehr anzeigen (${hiddenCount})`,
  showLessLabel = "Weniger anzeigen",
}: GradientFadeListProps<T>) {
  const [expanded, setExpanded] = useState(false);
  const [rowOverflow, setRowOverflow] = useState({ overflows: false, hiddenCount: 0, maxHeight: 0 });
  const listRef = useRef<HTMLDivElement>(null);
  const useRows = previewRows != null && previewRows > 0;
  const hasMoreByCount = items.length > previewCount;
  const hasMore = useRows ? rowOverflow.overflows && rowOverflow.hiddenCount > 0 : hasMoreByCount;
  const hiddenCount = useRows ? rowOverflow.hiddenCount : Math.max(0, items.length - previewCount);

  useLayoutEffect(() => {
    if (!useRows) return;
    const el = listRef.current;
    if (!el) return;

    const measure = () => {
      const previousMaxHeight = el.style.maxHeight;
      const previousOverflow = el.style.overflow;
      el.style.maxHeight = "none";
      el.style.overflow = "visible";
      const next = measureWrapRows(el, previewRows!);
      el.style.maxHeight = previousMaxHeight;
      el.style.overflow = previousOverflow;
      setRowOverflow((current) => {
        if (
          current.overflows === next.overflows &&
          current.hiddenCount === next.hiddenCount &&
          current.maxHeight === next.maxHeight
        ) {
          return current;
        }
        return next;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [items, listClassName, previewRows, useRows]);

  if (items.length === 0) return null;

  const visibleCount = useRows || expanded || !hasMoreByCount ? items.length : previewCount;
  const visible = items.slice(0, visibleCount);
  const collapsedByRows = useRows && !expanded && rowOverflow.overflows && rowOverflow.hiddenCount > 0;
  const showCountPreview = !useRows && !expanded && hasMore;

  return (
    <div className={className}>
      <div className={`gradient-fade-list ${showCountPreview ? "gradient-fade-list--preview" : ""}`}>
        <div
          ref={listRef}
          className={`gradient-fade-list__items ${listClassName}`}
          aria-live="polite"
          style={collapsedByRows ? { maxHeight: rowOverflow.maxHeight, overflow: "hidden" } : undefined}
        >
          {visible.map((item, index) => (
            <Fragment key={getKey(item, index)}>{renderItem(item, index)}</Fragment>
          ))}
        </div>
        {showCountPreview ? <div className="gradient-fade-list__fade" aria-hidden="true" /> : null}
      </div>

      {hasMore ? (
        <button
          type="button"
          className="show-more-btn mt-2 w-full"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? showLessLabel : showMoreLabel(hiddenCount)}
        </button>
      ) : null}
    </div>
  );
}
