"use client";

import { useEffect, useMemo, useState } from "react";
import GradientFadeList from "@/components/GradientFadeList";
import {
  type PerformanceTip,
  type TipScope,
  loadPerformanceTips,
  removePerformanceTip,
  savePerformanceTips,
  upsertPerformanceTip,
} from "@/lib/performance-tips";
import { exerciseSubcategoriesByCategory } from "@/lib/training-data";

const SCOPE_OPTIONS: { value: TipScope; label: string }[] = [
  { value: "spielnotizen", label: "Spielnotizen (Spieltag & Spieltraining)" },
  { value: "basketball_training", label: "Basketball-Training + Schwerpunkt" },
];

const TIP_GROUP_ORDER: TipScope[] = ["spielnotizen", "basketball_training"];

const BASKETBALL_SUBS = exerciseSubcategoriesByCategory.Basketball;

export default function TipsPage() {
  const [tips, setTips] = useState<PerformanceTip[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [scope, setScope] = useState<TipScope>("basketball_training");
  const [scopeValue, setScopeValue] = useState("Shooting");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setTips(loadPerformanceTips());
    setHydrated(true);
  }, []);

  const grouped = useMemo(() => {
    return {
      spielnotizen: tips.filter((tip) => tip.scope === "spielnotizen" || tip.scope === "game" || tip.scope === "game_training"),
      basketball_training: tips.filter(
        (tip) => tip.scope === "basketball_training" || tip.scope === "subcategory",
      ),
    };
  }, [tips]);

  const persist = (next: PerformanceTip[]) => {
    setTips(next);
    savePerformanceTips(next);
  };

  const resetForm = () => {
    setTitle("");
    setContent("");
    setScope("basketball_training");
    setScopeValue("Shooting");
    setEditingId(null);
  };

  const startEdit = (tip: PerformanceTip) => {
    setEditingId(tip.id);
    setTitle(tip.title);
    setContent(tip.content);
    const migratedScope =
      tip.scope === "game" || tip.scope === "game_training"
        ? "spielnotizen"
        : tip.scope === "subcategory"
          ? "basketball_training"
          : (tip.scope as TipScope);
    setScope(migratedScope);
    setScopeValue(tip.scopeValue ?? "Shooting");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitTip = () => {
    const nextTitle = title.trim();
    const nextContent = content.trim();
    if (!nextTitle || !nextContent) return;
    if (scope === "basketball_training" && !scopeValue.trim()) return;
    const prev = editingId ? tips.find((t) => t.id === editingId) : null;
    const subVal = scope === "basketball_training" ? scopeValue.trim() : undefined;
    const next = upsertPerformanceTip(tips, {
      id: editingId ?? undefined,
      title: nextTitle,
      content: nextContent,
      scope,
      scopeValue: subVal,
      active: prev?.active ?? true,
    });
    persist(next);
    resetForm();
  };

  if (!hydrated) {
    return (
      <main className="app-container animate-in">
        <p className="text-sm text-muted">Tipps werden geladen…</p>
      </main>
    );
  }

  return (
    <main className="app-container animate-in">
      <header>
        <p className="page-eyebrow">Performance Notes</p>
        <h1 className="page-title">Tipps &amp; Notizen</h1>
        <p className="page-subtitle">
          Spielnotizen erscheinen vor Spieltag und Spieltraining. Basketball-Tipps mit Schwerpunkt passen zu deinem Training.
        </p>
      </header>

      <section className="mt-4 app-card">
        <p className="section-eyebrow">{editingId ? "Notiz bearbeiten" : "Neue Notiz"}</p>
        <h2 className="section-title mt-1">{editingId ? "Eintrag anpassen" : "Schreibe einen Tipp"}</h2>
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
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {scope === "basketball_training" ? (
              <select
                value={BASKETBALL_SUBS.includes(scopeValue) ? scopeValue : "__other__"}
                onChange={(event) => {
                  const v = event.target.value;
                  if (v === "__other__") setScopeValue("");
                  else setScopeValue(v);
                }}
                className="select"
              >
                {BASKETBALL_SUBS.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
                <option value="__other__">Sonstiges …</option>
              </select>
            ) : null}
          </div>
          {scope === "basketball_training" && !BASKETBALL_SUBS.includes(scopeValue) ? (
            <input
              value={scopeValue}
              onChange={(event) => setScopeValue(event.target.value)}
              placeholder="Eigener Schwerpunkt (z.B. Post)"
              className="input"
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void submitTip()}>
              {editingId ? "Änderungen speichern" : "Notiz speichern"}
            </button>
            {editingId ? (
              <button type="button" className="btn btn-ghost" onClick={() => void resetForm()}>
                Abbrechen
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-4 space-y-3">
        {TIP_GROUP_ORDER.map((key) => (
          <div key={key} className="app-card">
            <h3 className="section-title">{SCOPE_OPTIONS.find((option) => option.value === key)?.label}</h3>
            {grouped[key].length === 0 ? (
              <p className="mt-3 text-sm text-muted">Keine Einträge.</p>
            ) : (
              <GradientFadeList
                className="mt-3"
                items={grouped[key]}
                listClassName="space-y-2"
                getKey={(tip) => tip.id}
                renderItem={(tip) => (
                  <article className="list-card">
                    <p className="font-semibold text-strong">{tip.title}</p>
                    {(tip.scope === "basketball_training" || tip.scope === "subcategory") && tip.scopeValue ? (
                      <p className="text-xs text-brand">Schwerpunkt: {tip.scopeValue}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-muted">{tip.content}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => void startEdit(tip)}>
                        Bearbeiten
                      </button>
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
                )}
              />
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
