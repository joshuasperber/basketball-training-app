"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import BasketballCoachingCard from "@/components/BasketballCoachingCard";
import TopSubTabs from "@/components/TopSubTabs";
import { buildBasketballCoachingPlan } from "@/lib/basketball-coaching";
import { downloadTrainingCsv } from "@/lib/export-training-csv";
import { getProgressionState } from "@/lib/level-system";
import { getWorkoutSessions } from "@/lib/session-storage";
import { loadTrainingGoalsBundle } from "@/lib/training-goals";

const mesocycleLabels: Record<string, string> = {
  base: "Basis",
  build: "Aufbau",
  peak: "Peak",
  deload: "Deload",
};

export default function ReviewPage() {
  const [bundle, setBundle] = useState(() => loadTrainingGoalsBundle());
  useEffect(() => {
    const tick = () => setBundle(loadTrainingGoalsBundle());
    const timer = window.setTimeout(tick, 0);
    window.addEventListener("bt:training-goals-updated", tick);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("bt:training-goals-updated", tick);
    };
  }, []);

  const activeGoals = useMemo(() => bundle.gymGoals.filter((goal) => goal.status === "active").length, [bundle.gymGoals]);
  const mesoLabel = mesocycleLabels[bundle.mesocyclePhase] ?? bundle.mesocyclePhase;

  let coaching: ReturnType<typeof buildBasketballCoachingPlan> | null = null;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("profile_cache_v4") : null;
    const parsed = raw
      ? (JSON.parse(raw) as { profile?: { favorite_position?: string | null }; playStyle?: string })
      : null;
    coaching = buildBasketballCoachingPlan({
      sessions: getWorkoutSessions(),
      position: parsed?.profile?.favorite_position ?? "sg",
      playStyle: parsed?.playStyle ?? "",
      level: getProgressionState().level,
    });
  } catch {
    coaching = null;
  }
  void bundle.updatedAtISO;

  const level = getProgressionState().level;

  return (
    <main className="app-container animate-in">
      <header>
        <p className="page-eyebrow">Wöchentliche Rückschau</p>
        <h1 className="page-title">Wochen-Review</h1>
        <p className="page-subtitle">
          Level {level}, adaptive Gym-Ziele und Basketball-Empfehlungen aus deinen letzten Sessions.
        </p>
      </header>
      <div className="mt-3">
        <TopSubTabs
          items={[
            { label: "Stats", href: "/stats" },
            { label: "Level", href: "/level" },
            { label: "Review", href: "/review" },
          ]}
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-violet-600/40 bg-gradient-to-br from-violet-950/50 via-zinc-950 to-zinc-950 p-5 shadow-lg shadow-violet-950/30">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-violet-100">Gym &amp; Mesozyklus</h2>
            <p className="mt-1 text-xs text-violet-300/80">
              Nur Kraft-Progression und Phasen — keine Basketball-Messzahlen (die siehst du im Bereich darunter).
            </p>
          </div>
          <Link href="/stats#gym-goals" className="text-xs font-medium text-violet-300 underline">
            Zu Stats &amp; Zielen
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-fuchsia-500/15 to-transparent p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Aktive Gym-Ziele</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-violet-100">{activeGoals}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Progressions aus Gewicht &amp; Wiederholungen</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Mesozyklus</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-100">{mesoLabel}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Anpassung unter Stats · Basis · Aufbau · Peak · Deload</p>
          </div>
        </div>
      </section>

      {coaching?.recommendations.length ? (
        <section className="mt-6 overflow-hidden rounded-2xl border border-cyan-600/45 bg-gradient-to-br from-cyan-950/55 via-zinc-950 to-zinc-950 p-5 shadow-lg shadow-cyan-950/25">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-cyan-100">Basketball aus Sessions</h2>
              <p className="mt-1 text-xs text-cyan-200/75">
                Nur Übungs-/Session-Daten (Würfe, Volumen) — angelehnt an die Spiel-Stats-Karten unter Stats.
              </p>
            </div>
          </div>
          <BasketballCoachingCard
            embedded
            title="Empfehlungen"
            recommendations={coaching.recommendations}
            windowDays={coaching.windowDays}
          />
        </section>
      ) : null}

      <section className="mt-6 app-card">
        <p className="section-eyebrow">Export</p>
        <h2 className="section-title mt-1">Daten sichern</h2>
        <p className="mt-1 text-xs text-muted">Export enthält Session-Logs und Spiel-Stats als CSV.</p>
        <button type="button" onClick={() => downloadTrainingCsv()} className="btn btn-ghost btn-sm mt-3">
          CSV herunterladen
        </button>
      </section>

      <Link href="/Weekly-Workout" className="btn btn-ghost btn-sm mt-8">
        ← Zurück zu Weekly
      </Link>
    </main>
  );
}
