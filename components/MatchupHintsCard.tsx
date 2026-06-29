"use client";

import { useMemo } from "react";
import { loadGameStats } from "@/lib/game-stats";
import { OPPONENT_STYLE_LABELS, type OpponentStyleTag } from "@/lib/opponent-styles";
import { aggregateOpponentStylesFromGames, buildSoloMatchupHints } from "@/lib/matchup-hints";
import { useClientMounted } from "@/lib/use-client-mounted";

function readProfileContext() {
  if (typeof window === "undefined") return { position: "sg", playStyle: "", heightCm: null as number | null };
  try {
    const raw = window.localStorage.getItem("profile_cache_v4");
    if (!raw) return { position: "sg", playStyle: "", heightCm: null };
    const parsed = JSON.parse(raw) as {
      profile?: { favorite_position?: string | null; height_cm?: number | null };
      playStyle?: string;
    };
    return {
      position: parsed.profile?.favorite_position ?? "sg",
      playStyle: parsed.playStyle ?? "",
      heightCm: parsed.profile?.height_cm ?? null,
    };
  } catch {
    return { position: "sg", playStyle: "", heightCm: null };
  }
}

const EMPTY_HINTS = buildSoloMatchupHints({
  opponentStyles: [],
  position: "sg",
  playStyle: "",
  heightCm: null,
});

export default function MatchupHintsCard() {
  const mounted = useClientMounted();

  const { hints, latestOpponent } = useMemo(() => {
    if (!mounted) {
      return { latestOpponent: undefined, hints: EMPTY_HINTS };
    }

    const profile = readProfileContext();
    const games = loadGameStats().filter((entry) => entry.context === "game");
    const latest = games[0];
    if (!latest?.opponentLabel) {
      return {
        latestOpponent: latest,
        hints: buildSoloMatchupHints({
          opponentStyles: [],
          position: profile.position,
          playStyle: profile.playStyle,
          heightCm: profile.heightCm,
        }),
      };
    }
    const styles =
      latest.opponentStyles && latest.opponentStyles.length > 0
        ? latest.opponentStyles
        : aggregateOpponentStylesFromGames(games, latest.opponentLabel);
    return {
      latestOpponent: latest,
      hints: buildSoloMatchupHints({
        opponentStyles: styles,
        position: profile.position,
        playStyle: profile.playStyle,
        heightCm: profile.heightCm,
      }),
    };
  }, [mounted]);

  return (
    <section className="app-card">
      <p className="section-eyebrow">Matchup</p>
      <h2 className="section-title mt-1">Solo Matchup-Hinweise</h2>
      {mounted && latestOpponent?.opponentLabel ? (
        <p className="mt-1 text-xs text-muted">
          Basierend auf letztem Spiel vs. <span className="text-strong">{latestOpponent.opponentLabel}</span>
          {latestOpponent.opponentStyles?.length ? (
            <>
              {" "}
              (
              {latestOpponent.opponentStyles.map((tag: OpponentStyleTag) => OPPONENT_STYLE_LABELS[tag]).join(", ")}
              )
            </>
          ) : null}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted">Trage beim Spiel tracken Gegner-Tags ein, um personalisierte Tipps zu erhalten.</p>
      )}
      <div className="mt-3 space-y-2">
        {hints.map((hint) => {
          const toneClass =
            hint.tone === "positive"
              ? "border-emerald-500/20 bg-emerald-500/5"
              : hint.tone === "caution"
                ? "border-amber-500/20 bg-amber-500/5"
                : "border-white/10 bg-white/[0.03]";
          return (
            <div key={hint.title} className={`rounded-xl border p-3 ${toneClass}`}>
              <p className="font-semibold text-strong">{hint.title}</p>
              <p className="mt-1 text-sm text-muted">{hint.detail}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
