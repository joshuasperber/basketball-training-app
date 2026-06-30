import type { OpponentStyleTag } from "@/lib/opponent-styles";

export type PlayerMatchupProfile = {
  displayName: string;
  position?: string | null;
  playStyle?: string | null;
  heightCm?: number | null;
  formScore?: number | null;
};

export type MatchupHint = {
  title: string;
  detail: string;
  tone: "positive" | "neutral" | "caution";
};

const GUARD_POSITIONS = new Set(["pg", "sg"]);
const WING_POSITIONS = new Set(["sf"]);
const BIG_POSITIONS = new Set(["pf", "c"]);

function normalizePosition(position?: string | null) {
  return (position ?? "sg").trim().toLowerCase();
}

function isGuard(position: string) {
  return GUARD_POSITIONS.has(position);
}

function isBig(position: string) {
  return BIG_POSITIONS.has(position);
}

function isWing(position: string) {
  return WING_POSITIONS.has(position) || (!isGuard(position) && !isBig(position));
}

export function buildSoloMatchupHints(input: {
  opponentStyles: OpponentStyleTag[];
  position?: string | null;
  playStyle?: string | null;
  heightCm?: number | null;
}): MatchupHint[] {
  const hints: MatchupHint[] = [];
  const position = normalizePosition(input.position);
  const playStyle = (input.playStyle ?? "").toLowerCase();
  const height = input.heightCm ?? null;
  const styles = input.opponentStyles;

  if (styles.length === 0) {
    return [
      {
        title: "Gegner-Typ wählen",
        detail: "Trage beim Spiel tracken Tags wie Big, Schnell oder Shooting ein — dann bekommst du passende Matchup-Tipps.",
        tone: "neutral",
      },
    ];
  }

  if (styles.includes("big")) {
    if (isGuard(position) || (height != null && height <= 190)) {
      hints.push({
        title: "Gegen Bigs",
        detail: "Nutze Tempo, P&R und Help-Defense. Vermeide isolierte Post-Ups gegen Länge — ziehe Bigs raus und attackiere Closeouts.",
        tone: "caution",
      });
    } else if (isBig(position)) {
      hints.push({
        title: "Big vs. Big",
        detail: "Box-out früh, Körper einsetzen und Second-Chance-Punkte anstreben. Hilf Guards mit Screens und Short-Rolls.",
        tone: "positive",
      });
    } else {
      hints.push({
        title: "Stretch & Länge",
        detail: "Als Wing: Closeouts diszipliniert, Rebounding unterstützen und in Transition angreifen.",
        tone: "neutral",
      });
    }
  }

  if (styles.includes("fast")) {
    hints.push({
      title: "Tempo-Gegner",
      detail: isBig(position)
        ? "Früh in Transition laufen, P&R nutzen statt isoliert zu posten. Defensive Kommunikation bei Wechseln ist entscheidend."
        : "Pressing mitdrücken, Ball sicher halten und schnelle Entscheidungen nach Rebounds treffen.",
      tone: isGuard(position) ? "positive" : "neutral",
    });
  }

  if (styles.includes("shooting")) {
    hints.push({
      title: "Shooting-Gegner",
      detail: playStyle.includes("shooter")
        ? "Du kannst offene Looks bestrafen — aber Closeouts und Help-Rotationen priorisieren, kein Leave-open."
        : "Keine Hilfe von der Starke — Closeouts und Contest-Disziplin. Offensive Spacing nutzen, wenn sie umschalten.",
      tone: "caution",
    });
  }

  if (styles.includes("physical")) {
    hints.push({
      title: "Physical Game",
      detail: "Erst Kontakt, dann Finish. Freiwürfe durch Attacken in den Körper mitnehmen — Fouls vermeiden, aber nicht ausweichen.",
      tone: "neutral",
    });
  }

  if (styles.includes("transition")) {
    hints.push({
      title: "Transition",
      detail: "Balance nach Offense: mindestens ein Spieler bleibt back. Bei Ballgewinn: sofort breit laufen.",
      tone: "positive",
    });
  }

  return hints.slice(0, 5);
}

export function buildTeamMatchupHints(input: {
  opponentStyles: OpponentStyleTag[];
  roster: PlayerMatchupProfile[];
}): MatchupHint[] {
  const hints = buildSoloMatchupHints({
    opponentStyles: input.opponentStyles,
    position: "sg",
    playStyle: "Allround",
  });

  const styles = input.opponentStyles;
  if (styles.includes("big")) {
    const guards = input.roster.filter((player) => isGuard(normalizePosition(player.position)));
    const bestGuard = [...guards].sort((a, b) => (b.formScore ?? 0) - (a.formScore ?? 0))[0];
    if (bestGuard) {
      hints.unshift({
        title: "Tempo-Spieler",
        detail: `${bestGuard.displayName} bringt Tempo und P&R gegen Bigs — ideal für Wechsel und Drive-Kick.`,
        tone: "positive",
      });
    }
  }

  if (styles.includes("fast")) {
    const athletes = input.roster.filter((player) => {
      const pos = normalizePosition(player.position);
      return isGuard(pos) || isWing(pos);
    });
    const names = athletes.slice(0, 2).map((player) => player.displayName).join(", ");
    if (names) {
      hints.push({
        title: "Pressing & Pace",
        detail: `${names} sollten den Ball früh unter Druck setzen und nach Rebounds sofort laufen.`,
        tone: "positive",
      });
    }
  }

  if (styles.includes("shooting")) {
    const bigs = input.roster.filter((player) => isBig(normalizePosition(player.position)));
    if (bigs.length > 0) {
      hints.push({
        title: "Closeouts",
        detail: `${bigs[0]?.displayName ?? "Bigs"}: Drop-Coverage oder Switch kommunizieren — keine offenen Dreier zulassen.`,
        tone: "caution",
      });
    }
  }

  return hints.slice(0, 6);
}

export function buildStartLineupRecommendation(roster: PlayerMatchupProfile[]): {
  starters: PlayerMatchupProfile[];
  bench: PlayerMatchupProfile[];
  rationale: string[];
} {
  const sorted = [...roster].sort((a, b) => (b.formScore ?? 0) - (a.formScore ?? 0));
  const picked: PlayerMatchupProfile[] = [];
  const used = new Set<string>();

  const pickNext = (predicate: (candidate: PlayerMatchupProfile) => boolean) => {
    const candidate = sorted.find((item) => !used.has(item.displayName) && predicate(item));
    if (!candidate) return;
    picked.push(candidate);
    used.add(candidate.displayName);
  };

  pickNext((player) => isGuard(normalizePosition(player.position)));
  pickNext((player) => isGuard(normalizePosition(player.position)) || isWing(normalizePosition(player.position)));
  pickNext((player) => isWing(normalizePosition(player.position)));
  pickNext((player) => isBig(normalizePosition(player.position)));
  pickNext((player) => true);

  while (picked.length < 5) {
    const candidate = sorted.find((player) => !used.has(player.displayName));
    if (!candidate) break;
    picked.push(candidate);
    used.add(candidate.displayName);
  }

  const bench = sorted.filter((player) => !used.has(player.displayName));
  const rationale = [
    `Start-Five nach Form-Score der letzten 14 Tage (${picked.map((player) => `${player.displayName} ${player.formScore ?? "–"}`).join(", ")}).`,
    bench.length > 0 ? `Bank: ${bench.slice(0, 4).map((player) => player.displayName).join(", ")}.` : "Keine weiteren Spieler im Kader.",
  ];

  return { starters: picked.slice(0, 5), bench, rationale };
}

export function aggregateOpponentStylesFromGames<T extends { opponentLabel?: string | null; opponentStyles?: OpponentStyleTag[] }>(
  games: T[],
  opponentName: string,
): OpponentStyleTag[] {
  const normalized = opponentName.trim().toLowerCase();
  const tags = new Set<OpponentStyleTag>();
  games.forEach((game) => {
    const label = (game.opponentLabel ?? "").trim().toLowerCase();
    if (!label || label !== normalized) return;
    (game.opponentStyles ?? []).forEach((tag) => tags.add(tag));
  });
  return [...tags];
}
