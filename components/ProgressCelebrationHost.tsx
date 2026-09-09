"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildPlayerBadges, computeBadgeStats, type PlayerBadge } from "@/lib/badge-system";
import {
  PROGRESSION_CELEBRATION_EVENT,
  getProgressionState,
  type ProgressionCelebrationDetail,
} from "@/lib/level-system";
import { getWorkoutSessions } from "@/lib/session-storage";

const SEEN_BADGES_KEY = "bt.celebrations.seen-badges.v1";

type Celebration =
  | { id: string; kind: "level"; level: number; levelDelta: number; totalXp: number }
  | { id: string; kind: "badge"; badge: PlayerBadge };

function readSeenBadges() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEEN_BADGES_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export default function ProgressCelebrationHost() {
  const [queue, setQueue] = useState<Celebration[]>([]);
  const initializedRef = useRef(false);
  const current = queue[0] ?? null;

  const enqueue = useCallback((items: Celebration[]) => {
    if (items.length === 0) return;
    setQueue((existing) => {
      const ids = new Set(existing.map((item) => item.id));
      return [...existing, ...items.filter((item) => !ids.has(item.id))];
    });
  }, []);

  const checkBadges = useCallback((announce: boolean) => {
    const level = getProgressionState().level;
    const unlocked = buildPlayerBadges(computeBadgeStats(getWorkoutSessions(), level)).unlocked;
    const seen = new Set(readSeenBadges());
    if (!initializedRef.current) {
      window.localStorage.setItem(SEEN_BADGES_KEY, JSON.stringify(unlocked.map((badge) => badge.id)));
      initializedRef.current = true;
      return;
    }
    const fresh = unlocked.filter((badge) => !seen.has(badge.id));
    if (fresh.length > 0) {
      fresh.forEach((badge) => seen.add(badge.id));
      window.localStorage.setItem(SEEN_BADGES_KEY, JSON.stringify([...seen]));
      if (announce) enqueue(fresh.map((badge) => ({ id: `badge-${badge.id}`, kind: "badge", badge })));
    }
  }, [enqueue]);

  useEffect(() => {
    checkBadges(false);
    const onProgression = (event: Event) => {
      const detail = (event as CustomEvent<ProgressionCelebrationDetail>).detail;
      if (detail?.levelDelta > 0) {
        enqueue([{ id: `level-${detail.level}-${Date.now()}`, kind: "level", level: detail.level, levelDelta: detail.levelDelta, totalXp: detail.totalXp }]);
      }
      checkBadges(true);
    };
    const onStats = () => checkBadges(true);
    window.addEventListener(PROGRESSION_CELEBRATION_EVENT, onProgression);
    window.addEventListener("bt:sessions-updated", onStats);
    window.addEventListener("bt:game-stats-updated", onStats);
    window.addEventListener("bt:cloud-progress-applied", onStats);
    return () => {
      window.removeEventListener(PROGRESSION_CELEBRATION_EVENT, onProgression);
      window.removeEventListener("bt:sessions-updated", onStats);
      window.removeEventListener("bt:game-stats-updated", onStats);
      window.removeEventListener("bt:cloud-progress-applied", onStats);
    };
  }, [checkBadges, enqueue]);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setQueue((items) => items.slice(1)), 9000);
    return () => window.clearTimeout(timer);
  }, [current]);

  if (!current) return null;
  const isLevel = current.kind === "level";

  return (
    <div className="celebration-overlay" role="dialog" aria-modal="true" aria-labelledby="celebration-title">
      <div className="celebration-confetti" aria-hidden>
        {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--piece": index } as React.CSSProperties} />)}
      </div>
      <section className="celebration-card">
        <div className="celebration-glow" aria-hidden />
        <div className="celebration-icon" aria-hidden>{isLevel ? "🏀" : current.badge.emoji}</div>
        <p className="celebration-kicker">{isLevel ? "LEVEL UP" : "NEUES BADGE"}</p>
        <h2 id="celebration-title" className="celebration-title">
          {isLevel ? `Level ${current.level}` : current.badge.name}
        </h2>
        <p className="celebration-copy">
          {isLevel
            ? `Stark! Du bist ${current.levelDelta > 1 ? `${current.levelDelta} Level` : "ein Level"} aufgestiegen und hast jetzt ${current.totalXp} XP.`
            : current.badge.description}
        </p>
        {!isLevel ? <span className="celebration-tier">{current.badge.tier} · {current.badge.category}</span> : null}
        <button type="button" className="btn btn-primary mt-5 min-w-36" onClick={() => setQueue((items) => items.slice(1))}>
          Weiter
        </button>
        {queue.length > 1 ? <p className="mt-3 text-xs text-muted">Noch {queue.length - 1} Auszeichnung{queue.length === 2 ? "" : "en"}</p> : null}
      </section>
    </div>
  );
}
