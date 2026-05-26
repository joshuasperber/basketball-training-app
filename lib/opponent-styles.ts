export const OPPONENT_STYLE_TAGS = ["big", "fast", "shooting", "physical", "transition"] as const;

export type OpponentStyleTag = (typeof OPPONENT_STYLE_TAGS)[number];

export const OPPONENT_STYLE_LABELS: Record<OpponentStyleTag, string> = {
  big: "Big / Größe",
  fast: "Schnell / Tempo",
  shooting: "Shooting / Space",
  physical: "Physical / Kontakt",
  transition: "Transition / Lauf",
};

export function normalizeOpponentStyles(value: unknown): OpponentStyleTag[] {
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is OpponentStyleTag =>
    typeof tag === "string" && OPPONENT_STYLE_TAGS.includes(tag as OpponentStyleTag),
  );
}

export function toggleOpponentStyle(current: OpponentStyleTag[], tag: OpponentStyleTag): OpponentStyleTag[] {
  return current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag];
}
