"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  type PlayerIntakeV1,
  savePlayerIntake,
} from "@/lib/coach-intake";

type StepId = "welcome" | "strengths" | "weaknesses" | "focus" | "age" | "role" | "extra" | "done";

type StepDef =
  | { id: "welcome"; bot: string; input: "none" }
  | { id: Exclude<StepId, "welcome" | "done">; bot: string; placeholder: string; multiline?: boolean; input: "text" | "age" };

const STEPS: StepDef[] = [
  {
    id: "welcome",
    bot: "Hey — schön, dass du da bist. Ich bin der Coach-Assistent deiner App. Bevor wir mit Training und Wochenplan loslegen, lernen wir uns kurz kennen. Es geht um dich, nicht um Leistungsdruck: Ehrliche Antworten helfen mir später, bessere Tipps für dich zu formulieren.",
    input: "none",
  },
  {
    id: "strengths",
    bot: "**Was sind deine Stärken** auf dem Platz? (z. B. Tempo, Wurf, Defense-Lesung, Kommunikation …)",
    placeholder: "Kurz in eigenen Worten …",
    multiline: true,
    input: "text",
  },
  {
    id: "weaknesses",
    bot: "**Wo siehst du deine Schwächen** — ganz ehrlich, ohne dass du dich rechtfertigen musst.",
    placeholder: "z. B. linke Hand, Kondition, Nervosität vor Spielen …",
    multiline: true,
    input: "text",
  },
  {
    id: "focus",
    bot: "**Worauf möchtest du besonders achten** in den nächsten Wochen? (Technik, Körper, Ernährung, Schlaf, Mental …)",
    placeholder: "Was ist dir am wichtigsten?",
    multiline: true,
    input: "text",
  },
  {
    id: "age",
    bot: "**Wie alt bist du?** (Zahl in Jahren — hilft bei realistischer Belastung.)",
    placeholder: "z. B. 16",
    input: "age",
  },
  {
    id: "role",
    bot: "**Wo siehst du deine Aufgabe im Team?** (Position, Rolle, was der Coach von dir erwartet …)",
    placeholder: "z. B. PG, Spielmacher, Rebounder von der Bank …",
    multiline: true,
    input: "text",
  },
  {
    id: "extra",
    bot: "**Gibt es noch etwas**, das ich wissen sollte? (Verletzungen, Ziele, nächstes Turnier … — optional, kannst du leer lassen.)",
    placeholder: "Optional …",
    multiline: true,
    input: "text",
  },
];

type Props = {
  onClose: () => void;
};

/**
 * Scrollbare Vollfläche: bei hohem Inhalt oder Tastatur kann man nachscrollen.
 * z-index per Inline-Style wegen möglicher Vorfahren-Stacking-Kontexte (ErrorBoundary etc.).
 */
const INTAKE_OVERLAY_STYLE: CSSProperties = {
  zIndex: 40,
  isolation: "isolate",
};

const INTAKE_SCROLL_ROOT_CLASS =
  "pointer-events-auto fixed inset-x-0 top-0 bottom-[var(--bottom-nav-height,4.25rem)] overflow-y-auto overscroll-y-auto bg-[#07070b]";

/** Mind. Viewport-Höhe + unten andocken (`mt-auto` auf der Karte), kein vertikales Zentrieren (schneidet sonst ab). */
const INTAKE_SHEET_COLUMN_CLASS =
  "mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]";

function IntakeModalRoot({
  children,
  ariaLabelledBy,
}: {
  children: ReactNode;
  ariaLabelledBy: string;
}) {
  return (
    <div
      className={INTAKE_SCROLL_ROOT_CLASS}
      style={INTAKE_OVERLAY_STYLE}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
    >
      <div className={INTAKE_SHEET_COLUMN_CLASS}>{children}</div>
    </div>
  );
}

function intakePortal(node: ReactNode) {
  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

export default function CoachIntakeChat({ onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [answers, setAnswers] = useState<Partial<Record<Exclude<StepDef["id"], "welcome">, string>>>({});
  const [aiConsent, setAiConsent] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
    };
  }, []);

  const current = STEPS[stepIndex];
  const isWelcome = current?.id === "welcome";
  const isLastQuestion = current?.id === "extra";

  const transcript = useMemo(() => {
    const lines: { role: "bot" | "user"; text: string }[] = [];
    for (let i = 0; i < stepIndex; i += 1) {
      const s = STEPS[i];
      lines.push({ role: "bot", text: s.bot });
      if (s.id !== "welcome" && answers[s.id]) {
        lines.push({ role: "user", text: answers[s.id]! });
      }
    }
    if (current) {
      lines.push({ role: "bot", text: current.bot });
    }
    return lines;
  }, [stepIndex, current, answers]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [stepIndex, transcript.length]);

  const persist = useCallback(
    (data: {
      skipped?: boolean;
      strengths: string;
      weaknesses: string;
      focusAttention: string;
      ageYears: number | null;
      teamRole: string;
      anythingElse: string;
    }) => {
      const full: PlayerIntakeV1 = {
        version: 1,
        completedAt: new Date().toISOString(),
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        focusAttention: data.focusAttention,
        ageYears: data.ageYears,
        teamRole: data.teamRole,
        anythingElse: data.anythingElse,
        skipped: data.skipped === true,
      };
      savePlayerIntake(full);
      onClose();
    },
    [onClose],
  );

  const handleSkip = () => {
    persist({
      skipped: true,
      strengths: "",
      weaknesses: "",
      focusAttention: "",
      ageYears: null,
      teamRole: "",
      anythingElse: "",
    });
  };

  const commitCurrentAndAdvance = () => {
    if (!current || current.id === "welcome") {
      setStepIndex((i) => i + 1);
      setDraft("");
      return;
    }

    if (current.input === "age") {
      const n = Number.parseInt(draft.trim(), 10);
      if (!Number.isFinite(n) || n < 6 || n > 99) {
        window.alert("Bitte gib dein Alter als Zahl zwischen 6 und 99 ein.");
        return;
      }
      setAnswers((a) => ({ ...a, age: String(n) }));
      setStepIndex((i) => i + 1);
      setDraft("");
      return;
    }

    if (current.id === "extra") {
      setAnswers((a) => ({ ...a, extra: draft.trim() }));
      setStepIndex((i) => i + 1);
      setDraft("");
      return;
    }

    const text = draft.trim();
    if (!text) {
      window.alert("Bitte kurz antworten — oder nutze „Überspringen“ unten.");
      return;
    }
    setAnswers((a) => ({ ...a, [current.id]: text }));
    setStepIndex((i) => i + 1);
    setDraft("");
  };

  const handleFinish = () => {
    const ageStr = answers.age;
    const ageYears = ageStr ? Number.parseInt(ageStr, 10) : null;
    persist({
      skipped: false,
      strengths: answers.strengths ?? "",
      weaknesses: answers.weaknesses ?? "",
      focusAttention: answers.focus ?? "",
      ageYears: ageYears != null && Number.isFinite(ageYears) ? ageYears : null,
      teamRole: answers.role ?? "",
      anythingElse: answers.extra ?? "",
    });
  };

  if (stepIndex >= STEPS.length) {
    const ageStr = answers.age;
    const ageYears = ageStr ? Number.parseInt(ageStr, 10) : null;
    return intakePortal(
      <IntakeModalRoot ariaLabelledBy="intake-done-title">
        <div className="mt-auto w-full max-h-[min(92dvh,calc(100svh-1.5rem))] overflow-y-auto rounded-2xl border border-zinc-600 bg-zinc-950 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
          <h2 id="intake-done-title" className="text-lg font-bold text-white">
            Zusammenfassung
          </h2>
          <p className="mt-2 text-sm text-zinc-400">So gebe ich es an deinen Coach weiter (du kannst das später im Profil ändern):</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-200">
            <li>
              <span className="text-zinc-500">Stärken:</span> {answers.strengths || "—"}
            </li>
            <li>
              <span className="text-zinc-500">Schwächen:</span> {answers.weaknesses || "—"}
            </li>
            <li>
              <span className="text-zinc-500">Fokus:</span> {answers.focus || "—"}
            </li>
            <li>
              <span className="text-zinc-500">Alter:</span> {ageYears != null && ageYears > 0 ? `${ageYears} Jahre` : "—"}
            </li>
            <li>
              <span className="text-zinc-500">Teamrolle:</span> {answers.role || "—"}
            </li>
            <li>
              <span className="text-zinc-500">Sonstiges:</span> {answers.extra || "—"}
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={handleFinish}>
              Speichern & loslegen
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setStepIndex(STEPS.length - 1);
              }}
            >
              Zurück
            </button>
          </div>
        </div>
      </IntakeModalRoot>,
    );
  }

  return intakePortal(
    <IntakeModalRoot ariaLabelledBy="intake-chat-title">
      <div className="relative mt-auto flex min-h-0 w-full max-h-[min(88dvh,calc(100svh-1.5rem))] flex-col overflow-hidden rounded-2xl border border-emerald-500/60 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
        <header className="shrink-0 border-b border-zinc-700/80 bg-zinc-950 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p id="intake-chat-title" className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
                Kennenlern-Chat
              </p>
              <p className="mt-0.5 text-sm text-zinc-400">Einmalig · dauert ca. 2 Minuten</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm shrink-0 text-zinc-400"
              onClick={handleSkip}
            >
              Später
            </button>
          </div>
        </header>

        <div
          ref={listRef}
          className="min-h-0 flex-1 touch-pan-y space-y-3 overflow-y-auto overscroll-y-contain px-4 py-3"
        >
          {transcript.map((line, idx) => (
            <div
              key={`${idx}-${line.role}`}
              className={`flex ${line.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  line.role === "bot"
                    ? "border border-zinc-600/80 bg-zinc-800 text-zinc-100"
                    : "bg-emerald-600 text-white"
                }`}
              >
                {line.role === "bot" ?
                  line.text.split("**").map((chunk, i) => (i % 2 === 1 ? <strong key={i}>{chunk}</strong> : chunk))
                : line.text}
              </div>
            </div>
          ))}
        </div>

        <footer className="shrink-0 border-t border-zinc-700/80 bg-zinc-950 px-4 py-3">
          {isWelcome ?
            <div className="space-y-3">
              <label className="flex items-start gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={aiConsent}
                  onChange={(e) => setAiConsent(e.target.checked)}
                />
                <span>
                  Ich willige ein, dass meine Angaben für KI-Coach-Empfehlungen verarbeitet werden (ggf. über Drittanbieter
                  wie Groq/OpenAI). Details in der{" "}
                  <a href="/datenschutz" className="text-indigo-300 underline" target="_blank" rel="noreferrer">
                    Datenschutzerklärung
                  </a>
                  .
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm disabled:opacity-50"
                  disabled={!aiConsent}
                  onClick={() => setStepIndex(1)}
                >
                  Los geht&apos;s
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleSkip}>
                  Überspringen
                </button>
              </div>
            </div>
          : stepIndex < STEPS.length ?
            <>
              {current.input === "age" ?
                <input
                  type="number"
                  inputMode="numeric"
                  min={6}
                  max={99}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={current.placeholder}
                  className="mb-2 w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
                />
              : <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={current.placeholder}
                  rows={3}
                  className="mb-2 w-full resize-none rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500"
                />
              }
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={commitCurrentAndAdvance}>
                  {isLastQuestion ? "Weiter zur Zusammenfassung" : "Antwort senden"}
                </button>
                {stepIndex > 1 ?
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setStepIndex((i) => Math.max(1, i - 1));
                      setDraft("");
                    }}
                  >
                    Zurück
                  </button>
                : null}
                <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={handleSkip}>
                  Überspringen
                </button>
              </div>
            </>
          : null}
        </footer>
      </div>
    </IntakeModalRoot>,
  );
}
