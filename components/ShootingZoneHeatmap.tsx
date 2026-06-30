import type { ShootingZoneKey, ShootingZoneTotals } from "@/lib/shooting-zone-stats";

type ZoneVisual = {
  zone: ShootingZoneKey;
  label: string;
  cx: number;
  cy: number;
  r: number;
};

const ZONE_VISUALS: ZoneVisual[] = [
  { zone: "free_throw", label: "FT", cx: 50, cy: 88, r: 6 },
  { zone: "at_rim", label: "Rim", cx: 50, cy: 72, r: 10 },
  { zone: "in_paint", label: "Paint", cx: 50, cy: 58, r: 12 },
  { zone: "mid_range", label: "Mid", cx: 50, cy: 42, r: 14 },
  { zone: "corner_three", label: "C3", cx: 18, cy: 38, r: 10 },
  { zone: "above_break_three", label: "3PT", cx: 50, cy: 22, r: 12 },
  { zone: "other", label: "?", cx: 82, cy: 38, r: 8 },
];

function zonePct(totals: ShootingZoneTotals, zone: ShootingZoneKey) {
  const entry = totals[zone];
  if (!entry || entry.attempts <= 0) return null;
  return Math.round((entry.makes / entry.attempts) * 100);
}

function zoneOpacity(pct: number | null) {
  if (pct == null) return 0.08;
  return 0.15 + (pct / 100) * 0.75;
}

type Props = {
  totals: ShootingZoneTotals;
  className?: string;
};

export default function ShootingZoneHeatmap({ totals, className = "" }: Props) {
  return (
    <div className={className}>
      <svg viewBox="0 0 100 100" className="mx-auto w-full max-w-xs" role="img" aria-label="Wurfzonen-Heatmap">
        <rect x="8" y="10" width="84" height="80" rx="4" fill="var(--bg-muted)" stroke="var(--border-subtle)" />
        <path d="M 8 70 H 92" stroke="var(--border-subtle)" strokeWidth="0.5" />
        <circle cx="50" cy="72" r="3" fill="none" stroke="var(--border-subtle)" strokeWidth="0.5" />
        {ZONE_VISUALS.map((visual) => {
          const pct = zonePct(totals, visual.zone);
          return (
            <g key={visual.zone}>
              <circle
                cx={visual.cx}
                cy={visual.cy}
                r={visual.r}
                fill={`rgba(99, 102, 241, ${zoneOpacity(pct)})`}
                stroke="rgba(99, 102, 241, 0.35)"
                strokeWidth="0.4"
              />
              <text x={visual.cx} y={visual.cy + 1} textAnchor="middle" fontSize="4" fill="var(--text-strong)">
                {pct != null ? `${pct}%` : "—"}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-center text-xs text-muted">Intensität = Wurfquote pro Zone (dunkler = höher)</p>
    </div>
  );
}
