"use client";

import { useMemo, useState } from "react";

export type TrendPoint = {
  /** ISO-Datum oder Label */
  label: string;
  value: number;
};

type TrendChartProps = {
  points: TrendPoint[];
  /** Beschriftung der Y-Achse, z. B. "Sekunden", "Reps", "kg" */
  yLabel?: string;
  /** Niedrigere Werte = besser (z. B. Zeiten). Standard: false. */
  lowerIsBetter?: boolean;
  /** Höhe in Pixel. Standard: 100. */
  height?: number;
  /** Maximalwert manuell setzen (sonst dynamisch). */
  yMax?: number;
};

const COLORS = {
  area: "rgba(34, 211, 238, 0.18)",
  stroke: "#22d3ee",
  strokeBetter: "#34d399",
  strokeWorse: "#f87171",
  axis: "rgba(255, 255, 255, 0.18)",
  text: "rgba(255, 255, 255, 0.55)",
};

export default function TrendChart({
  points,
  yLabel = "",
  lowerIsBetter = false,
  height = 100,
  yMax,
}: TrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { width, padding, normalized } = useMemo(() => {
    const w = 320;
    const p = { top: 12, right: 12, bottom: 22, left: 32 };
    const maxValue = yMax ?? Math.max(...points.map((point) => point.value), 1);
    const minValue = 0;
    const denom = Math.max(0.0001, maxValue - minValue);
    const innerW = w - p.left - p.right;
    const innerH = height - p.top - p.bottom;
    const step = points.length > 1 ? innerW / (points.length - 1) : innerW;
    const coords = points.map((point, index) => ({
      x: p.left + index * step,
      y: p.top + innerH - ((point.value - minValue) / denom) * innerH,
      raw: point,
    }));
    return { width: w, padding: p, normalized: { coords, maxValue, innerH } };
  }, [height, points, yMax]);

  if (points.length === 0) {
    return <p className="text-xs text-faint">Keine Daten.</p>;
  }

  const linePath = normalized.coords
    .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`)
    .join(" ");

  const areaPath = `${linePath} L${normalized.coords[normalized.coords.length - 1].x},${height - padding.bottom} L${padding.left},${height - padding.bottom} Z`;

  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  const improving = lowerIsBetter ? last <= first : last >= first;
  const strokeColor = improving ? COLORS.strokeBetter : COLORS.strokeWorse;
  const deltaPct = first === 0 ? 0 : Math.round(((last - first) / first) * 100);
  const deltaLabel = lowerIsBetter ? -deltaPct : deltaPct;

  const hover = hoverIndex != null ? normalized.coords[hoverIndex] : null;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-wide text-faint">{yLabel}</p>
        <p
          className={`text-xs font-semibold tabular-nums ${
            deltaLabel >= 0 ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {deltaLabel >= 0 ? "▲" : "▼"} {Math.abs(deltaLabel)}%
        </p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full"
        preserveAspectRatio="none"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke={COLORS.axis}
          strokeWidth="1"
        />
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke={COLORS.axis}
          strokeWidth="1"
        />
        <text x="4" y={padding.top + 4} fontSize="9" fill={COLORS.text}>
          {Math.round(normalized.maxValue)}
        </text>
        <text x="4" y={height - padding.bottom + 0} fontSize="9" fill={COLORS.text}>
          0
        </text>
        <path d={areaPath} fill="url(#trend-area)" />
        <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        {normalized.coords.map((coord, index) => (
          <g key={`${coord.raw.label}-${index}`}>
            <circle cx={coord.x} cy={coord.y} r="2.5" fill={strokeColor} />
            <rect
              x={coord.x - 12}
              y={padding.top}
              width={24}
              height={height - padding.top - padding.bottom}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(index)}
            />
          </g>
        ))}
        {hover ? (
          <g>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="rgba(255,255,255,0.25)"
              strokeDasharray="2 3"
            />
            <circle cx={hover.x} cy={hover.y} r="4" fill="#fff" />
          </g>
        ) : null}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-faint">
        <span>{points[0]?.label}</span>
        {hover ? (
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-strong tabular-nums">
            {hover.raw.label}: {hover.raw.value}
          </span>
        ) : null}
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}
