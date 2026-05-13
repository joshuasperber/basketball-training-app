"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import TopSubTabs from "@/components/TopSubTabs";
import {
  type PerformanceTip,
  type TipScope,
  loadPerformanceTips,
  removePerformanceTip,
  savePerformanceTips,
  upsertPerformanceTip,
} from "@/lib/performance-tips";

const SCOPE_OPTIONS: { value: TipScope; label: string }[] = [
  { value: "game", label: "Vor Spiel" },
  { value: "game_training", label: "Vor Spieltraining" },
  { value: "basketball_training", label: "Vor Basketball-Training" },
  { value: "subcategory", label: "Workout-Schwerpunkt (z.B. Shooting)" },
];

export default function TipsPage() {
  const [tips, setTips] = useState<PerformanceTip[]>(() => loadPerformanceTips());
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [scope, setScope] = useState<TipScope>("subcategory");
  const [scopeValue, setScopeValue] = useState("Shooting");

  const grouped = useMemo(() => {
    return {
      game: tips.filter((tip) => tip.scope === "game"),
      game_training: tips.filter((tip) => tip.scope === "game_training"),
      basketball_training: tips.filter((tip) => tip.scope === "basketball_training"),
      subcategory: tips.filter((tip) => tip.scope === "subcategory"),
    };
  }, [tips]);

  const persist = (next: PerformanceTip[]) => {
    setTips(next);
    savePerformanceTips(next);
  };

  return (
    <main className="app-container animate-in">
      <header>
        <p className="page-eyebrow">Performance Notes</p>
        <h1 className="page-title">Tipps &amp; Notizen</h1>
        <p className="page-subtitle">Diese Notizen werden dir vor Spiel, Spieltraining oder passenden Workouts angezeigt.</p>
      </header>
      <div className="mt-3">
        <TopSubTabs items={[{ label: "Workouts", href: "/workouts" }, { label: "Tipps", href: "/tips" }]} />
      </div>

      <section className="mt-4 app-card">
        <p className="section-eyebrow">Neue Notiz</p>
        <h2 className="section-title mt-1">Schreibe einen Tipp</h2>
        <div className="mt-3 space-y-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Titel (z.B. Shooting)"
            className="input"
          />
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Notiz"
            rows={3}
            className="textarea"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={scope} onChange={(event) => setScope(event.target.value as TipScope)} className="select">
              {SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {scope === "subcategory" ? (
              <input
                value={scopeValue}
                onChange={(event) => setScopeValue(event.target.value)}
                placeholder="Schwerpunkt (z.B. Shooting)"
                className="input"
              />
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => {
              const nextTitle = title.trim();
              const nextContent = content.trim();
              if (!nextTitle || !nextContent) return;
              const next = upsertPerformanceTip(tips, {
                title: nextTitle,
                content: nextContent,
                scope,
                scopeValue: scope === "subcategory" ? scopeValue.trim() || "Shooting" : undefined,
                active: true,
              });
              persist(next);
              setTitle("");
              setContent("");
            }}
          >
            Notiz speichern
          </button>
        </div>
      </section>

      <section className="mt-4 space-y-3">
        {(Object.keys(grouped) as TipScope[]).map((key) => (
          <div key={key} className="app-card">
            <h3 className="section-title">
              {SCOPE_OPTIONS.find((option) => option.value === key)?.label}
            </h3>
            <div className="mt-3 space-y-2">
              {grouped[key].length === 0 ? (
                <p className="text-sm text-muted">Keine Einträge.</p>
              ) : (
                grouped[key].map((tip) => (
                  <article key={tip.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="font-semibold text-strong">{tip.title}</p>
                    {tip.scope === "subcategory" ? (
                      <p className="text-xs text-cyan-300">Schwerpunkt: {tip.scopeValue}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-muted">{tip.content}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => {
                          const toggled = tips.map((entry) =>
                            entry.id === tip.id ? { ...entry, active: !entry.active } : entry,
                          );
                          persist(toggled);
                        }}
                      >
                        {tip.active ? "Deaktivieren" : "Aktivieren"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger-outline btn-xs"
                        onClick={() => persist(removePerformanceTip(tips, tip.id))}
                      >
                        Löschen
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        ))}
      </section>

      <Link href="/workouts" className="btn btn-ghost btn-sm mt-4">
        ← Zurück zu Workouts
      </Link>
    </main>
  );
}
