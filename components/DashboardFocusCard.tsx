"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { gameInvolvesOwnTeam, loadLeagueBundle, scheduleForSeason, getActiveSeason } from "@/lib/league";
import {
  buildWeeklyFocus,
  loadReadinessHistory,
  readinessAverage,
  saveReadinessEntry,
  type ReadinessEntry,
} from "@/lib/readiness";

const CHECKS = [
  { key: "energy", label: "Energie", low: "leer", high: "voll" },
  { key: "freshness", label: "Körpergefühl", low: "schwer", high: "frisch" },
  { key: "motivation", label: "Motivation", low: "niedrig", high: "hoch" },
] as const;

export default function DashboardFocusCard({
  dateKey,
  completed,
  planned,
  hasTodayPlan,
}: {
  dateKey: string;
  completed: number;
  planned: number;
  hasTodayPlan: boolean;
}) {
  const [entry, setEntry] = useState<ReadinessEntry | null>(null);
  const [editing, setEditing] = useState(false);
  const [leagueRevision, setLeagueRevision] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setEntry(loadReadinessHistory()[dateKey] ?? null);
      setLeagueRevision((value) => value + 1);
    };
    const timer = window.setTimeout(refresh, 0);
    const refreshLeague = () => setLeagueRevision((value) => value + 1);
    window.addEventListener("bt:league-updated", refreshLeague);
    window.addEventListener("bt:readiness-updated", refresh);
    window.addEventListener("bt:cloud-progress-applied", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("bt:league-updated", refreshLeague);
      window.removeEventListener("bt:readiness-updated", refresh);
      window.removeEventListener("bt:cloud-progress-applied", refresh);
    };
  }, [dateKey]);

  const nextGame = useMemo(() => {
    if (typeof window === "undefined" || leagueRevision === 0) return null;
    const bundle = loadLeagueBundle();
    const season = getActiveSeason(bundle);
    if (!season) return null;
    const game = scheduleForSeason(bundle, season.id).find((candidate) =>
      candidate.date >= dateKey && gameInvolvesOwnTeam(candidate) && candidate.status !== "cancelled" && candidate.status !== "postponed",
    );
    if (!game) return null;
    const opponentId = game.homeTeamId === bundle.ownTeam.id ? game.awayTeamId : game.homeTeamId;
    return { date: game.date, opponent: bundle.opponents.find((team) => team.id === opponentId)?.name ?? "das nächste Spiel" };
  }, [dateKey, leagueRevision]);

  const focus = useMemo(() => buildWeeklyFocus({ readiness: entry, nextGame, today: dateKey, completed, planned, hasTodayPlan }), [completed, dateKey, entry, hasTodayPlan, nextGame, planned]);
  const score = readinessAverage(entry);

  function setScore(key: "energy" | "freshness" | "motivation", value: number) {
    const next: ReadinessEntry = {
      date: dateKey,
      energy: entry?.energy ?? 3,
      freshness: entry?.freshness ?? 3,
      motivation: entry?.motivation ?? 3,
      [key]: value,
      updatedAt: new Date().toISOString(),
    };
    setEntry(next);
    saveReadinessEntry(next);
  }

  return (
    <section className={`dashboard-focus dashboard-focus--${focus.tone}`} aria-labelledby="weekly-focus-title">
      <div className="dashboard-focus__main">
        <div>
          <p className="section-eyebrow">{focus.eyebrow}</p>
          <h2 id="weekly-focus-title" className="section-title mt-1">{focus.title}</h2>
          <p className="mt-1 text-sm text-muted">{focus.detail}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={focus.href} className="btn btn-primary btn-sm">{focus.action}</Link>
          <button type="button" className="btn btn-outline btn-sm" aria-expanded={editing} onClick={() => setEditing((value) => !value)}>{entry ? `Tagesform ${score}/5` : "Tagesform eintragen"}</button>
        </div>
      </div>
      {editing ? (
        <div className="readiness-check mt-4">
          <div><strong>30-Sekunden-Check-in</strong><small>Nur ein kurzer Hinweis für deine Trainingssteuerung – keine medizinische Bewertung.</small></div>
          {CHECKS.map((check) => (
            <div key={check.key} className="readiness-row" role="group" aria-label={check.label}>
              <span className="readiness-row__label">{check.label}</span>
              <span className="readiness-row__hint">{check.low}</span>
              <div className="readiness-row__scale">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={entry?.[check.key] === value ? "is-active" : ""}
                    aria-label={`${check.label} ${value} von 5`}
                    aria-pressed={entry?.[check.key] === value}
                    onClick={() => setScore(check.key, value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <span className="readiness-row__hint">{check.high}</span>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Fertig</button>
        </div>
      ) : null}
    </section>
  );
}
