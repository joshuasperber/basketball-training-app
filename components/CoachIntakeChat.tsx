"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import NumericInput from "@/components/ui/NumericInput";
import { useAppDialog } from "@/components/ui/AppDialogProvider";
import { grantAiConsent } from "@/lib/ai-consent";
import { type PlayerIntakeV1, savePlayerIntake } from "@/lib/coach-intake";

type StepId = "welcome" | "strengths" | "weaknesses" | "focus" | "age" | "role" | "extra" | "done";

type StepDef =
  | { id: "welcome"; bot: string; input: "none" }
  | { id: Exclude<StepId, "welcome" | "done">; bot: string; placeholder: string; multiline?: boolean; input: "text" | "age" };

const STEPS: StepDef[] = [
  {
    id: "welcome",
    bot: "Hey — schön, dass du da bist. Ich bin der Coach-Assistent deiner App. Bevor wir mit Training und Wochenplan loslegen, lernen wir uns kurz kennen. Ehrliche Antworten helfen mir später, bessere Tipps für dich zu formulieren.",
    input: "none",
  },
  {
    id: "strengths",
    bot: "**Was sind deine Stärken** auf dem Platz?",
    placeholder: "z. B. Tempo, Wurf, Defense …",
    multiline: true,
    input: "text",
  },
  {
    id: "weaknesses",
    bot: "**Wo siehst du deine Schwächen** — ganz ehrlich?",
    placeholder: "z. B. linke Hand, Kondition …",
    multiline: true,
    input: "text",
  },
  {
    id: "focus",
    bot: "**Worauf möchtest du besonders achten** in den nächsten Wochen?",
    placeholder: "Technik, Körper, Mental …",
    multiline: true,
    input: "text",
  },
  {
    id: "age",
    bot: "**Wie alt bist du?** (Jahre)",
    placeholder: "z. B. 16",
    input: "age",
  },
  {
    id: "role",
    bot: "**Wo siehst du deine Aufgabe im Team?**",
    placeholder: "z. B. PG, Spielmacher …",
    multiline: true,
    input: "text",
  },
  {
    id: "extra",
    bot: "**Gibt es noch etwas**, das ich wissen sollte? (optional)",
    placeholder: "Verletzungen, Ziele …",
    multiline: true,
    input: "text",
  },
];

type Props = {
  onClose: () => void;
  mandatory?: boolean;
  embedded?: boolean;
  variant?: "light" | "dark";
};

function IntakeShell({
  children,
  embedded,
  variant,
  ariaLabelledBy,
}: {
  children: ReactNode;
  embedded?: boolean;
  variant: "light" | "dark";
  ariaLabelledBy: string;
}) {
  const isLight = variant === "light";
  const overlayStyle: CSSProperties = embedded ? {} : { zIndex: 55, isolation: "isolate" };

  const rootClass = embedded
    ? "w-full"
    : `pointer-events-auto fixed inset-x-0 top-0 bottom-0 overflow-y-auto overscroll-y-contain ${
        isLight ? "bg-[var(--bg-base)]" : "bg-[#07070b]"
      }`;

  return (
    <div className={rootClass} style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby={ariaLabelledBy}>
      <div className={embedded ? "" : "mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col px-3 pb-6 pt-3"}>{children}</div>
    </div>
  );
}

export default function CoachIntakeChat({
  onClose,
  mandatory = false,
  embedded = false,
  variant = "dark",
}: Props) {
  const appDialog = useAppDialog();
  const isLight = variant === "light";
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [ageDraft, setAgeDraft] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<Exclude<StepDef["id"], "welcome">, string>>>({});
  const [aiConsent, setAiConsent] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (embedded) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [embedded]);

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
    if (current) lines.push({ role: "bot", text: current.bot });
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
      const n = ageDraft;
      if (n == null || n < 6 || n > 99) {
        void appDialog.alert({ message: "Bitte gib dein Alter als Zahl zwischen 6 und 99 ein." });
        return;
      }
      setAnswers((a) => ({ ...a, age: String(n) }));
      setStepIndex((i) => i + 1);
      setDraft("");
      setAgeDraft(null);
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
      void appDialog.alert({ message: "Bitte kurz antworten — oder nutze „Überspringen“." });
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

  const cardClass = isLight
    ? "app-card flex min-h-[420px] max-h-[min(78dvh,640px)] flex-col overflow-hidden p-0"
    : "relative mt-auto flex min-h-0 w-full max-h-[min(88dvh,calc(100svh-1.5rem))] flex-col overflow-hidden rounded-2xl border border-emerald-500/60 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.85)]";

  const botBubble = isLight
    ? "border border-[var(--surface-border)] bg-[var(--bg-elevated-2)] text-[var(--fg-default)]"
    : "border border-zinc-600/80 bg-zinc-800 text-zinc-100";
  const userBubble = isLight ? "bg-[var(--brand-500)] text-white" : "bg-emerald-600 text-white";

  const renderContent = () => {
    if (stepIndex >= STEPS.length) {
      const ageStr = answers.age;
      const ageYears = ageStr ? Number.parseInt(ageStr, 10) : null;
      return (
        <IntakeShell embedded={embedded} variant={variant} ariaLabelledBy="intake-done-title">
          <div className={isLight ? "app-card p-4" : "mt-auto w-full rounded-2xl border border-zinc-600 bg-zinc-950 p-4"}>
            <h2 id="intake-done-title" className={`text-lg font-bold ${isLight ? "text-strong" : "text-white"}`}>
              Zusammenfassung
            </h2>
            <ul className={`mt-3 space-y-2 text-sm ${isLight ? "text-muted" : "text-zinc-200"}`}>
              <li>Stärken: {answers.strengths || "—"}</li>
              <li>Schwächen: {answers.weaknesses || "—"}</li>
              <li>Fokus: {answers.focus || "—"}</li>
              <li>Alter: {ageYears != null && ageYears > 0 ? `${ageYears} Jahre` : "—"}</li>
              <li>Teamrolle: {answers.role || "—"}</li>
              <li>Sonstiges: {answers.extra || "—"}</li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary btn-sm" onClick={handleFinish}>
                Speichern & App starten
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStepIndex(STEPS.length - 1)}>
                Zurück
              </button>
            </div>
          </div>
        </IntakeShell>
      );
    }

    return (
      <IntakeShell embedded={embedded} variant={variant} ariaLabelledBy="intake-chat-title">
        <div className={cardClass}>
          <header className={`shrink-0 border-b px-4 py-3 ${isLight ? "border-[var(--surface-border)]" : "border-zinc-700/80 bg-zinc-950"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="intake-chat-title" className={`text-xs font-semibold uppercase tracking-wide ${isLight ? "text-[var(--accent-emerald)]" : "text-emerald-400"}`}>
                  Kennenlern-Chat
                </p>
                <p className={`mt-0.5 text-sm ${isLight ? "text-muted" : "text-zinc-400"}`}>Einmalig · ca. 2 Minuten</p>
              </div>
              {!mandatory ? (
                <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={handleSkip}>
                  Später
                </button>
              ) : null}
            </div>
          </header>

          <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {transcript.map((line, idx) => (
              <div key={`${idx}-${line.role}`} className={`flex ${line.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${line.role === "bot" ? botBubble : userBubble}`}>
                  {line.role === "bot"
                    ? line.text.split("**").map((chunk, i) => (i % 2 === 1 ? <strong key={i}>{chunk}</strong> : chunk))
                    : line.text}
                </div>
              </div>
            ))}
          </div>

          <footer className={`shrink-0 border-t px-4 py-3 ${isLight ? "border-[var(--surface-border)]" : "border-zinc-700/80 bg-zinc-950"}`}>
            {isWelcome ? (
              <div className="space-y-3">
                <label className={`flex items-start gap-2 text-xs ${isLight ? "text-muted" : "text-zinc-400"}`}>
                  <input type="checkbox" className="mt-0.5" checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)} />
                  <span>
                    Ich willige ein, dass meine Angaben für KI-Coach-Empfehlungen verarbeitet werden.{" "}
                    <a href="/datenschutz" className="text-[var(--accent-indigo)] underline" target="_blank" rel="noreferrer">
                      Datenschutz
                    </a>
                  </span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm disabled:opacity-50"
                    disabled={!aiConsent}
                    onClick={() => {
                      void grantAiConsent();
                      setStepIndex(1);
                    }}
                  >
                    Los geht&apos;s
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleSkip}>
                    Überspringen
                  </button>
                </div>
              </div>
            ) : stepIndex < STEPS.length ? (
              <>
                {current.input === "age" ? (
                  <NumericInput
                    className="input mb-2"
                    value={ageDraft}
                    onValueChange={setAgeDraft}
                    min={6}
                    max={99}
                    placeholder={current.placeholder}
                  />
                ) : (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={current.placeholder}
                    rows={3}
                    className="input mb-2 min-h-[80px] resize-none"
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary btn-sm" onClick={commitCurrentAndAdvance}>
                    {isLastQuestion ? "Weiter zur Zusammenfassung" : "Antwort senden"}
                  </button>
                  {stepIndex > 1 ? (
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
                  ) : null}
                  <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={handleSkip}>
                    Überspringen
                  </button>
                </div>
              </>
            ) : null}
          </footer>
        </div>
      </IntakeShell>
    );
  };

  const content = renderContent();
  if (embedded || typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
