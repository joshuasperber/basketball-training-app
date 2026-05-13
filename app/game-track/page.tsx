"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadGameStats } from "@/lib/game-stats";
import { saveGameStatAndSync } from "@/lib/services/game-stats-sync";

function toNullableNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export default function GameTrackPage() {
  const searchParams = useSearchParams();
  const paramDate = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const paramContext = (searchParams.get("context") === "game_training" ? "game_training" : "game") as "game" | "game_training";
  const editId = searchParams.get("id");

  const [resolvedDate, setResolvedDate] = useState(paramDate);
  const [resolvedContext, setResolvedContext] = useState<"game" | "game_training">(paramContext);
  const [opponentLabel, setOpponentLabel] = useState("");
  const [minutes, setMinutes] = useState("");
  const [points, setPoints] = useState("");
  const [assists, setAssists] = useState("");
  const [rebounds, setRebounds] = useState("");
  const [steals, setSteals] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (editId) {
        const entry = loadGameStats().find((item) => item.id === editId);
        if (entry) {
          setResolvedDate(entry.date);
          setResolvedContext(entry.context);
          setOpponentLabel(entry.opponentLabel ?? "");
          setMinutes(entry.minutes != null ? String(entry.minutes) : "");
          setPoints(entry.points != null ? String(entry.points) : "");
          setAssists(entry.assists != null ? String(entry.assists) : "");
          setRebounds(entry.rebounds != null ? String(entry.rebounds) : "");
          setSteals(entry.steals != null ? String(entry.steals) : "");
          setNotes(entry.notes ?? "");
          setSaved(false);
          return;
        }
      }
      setResolvedDate(paramDate);
      setResolvedContext(paramContext);
      setOpponentLabel("");
      setMinutes("");
      setPoints("");
      setAssists("");
      setRebounds("");
      setSteals("");
      setNotes("");
      setSaved(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editId, paramDate, paramContext]);

  const modeBadge = useMemo(
    () => (resolvedContext === "game" ? "Spieltag" : "Spieltraining"),
    [resolvedContext],
  );

  const statFields = [
    { label: "Minuten", value: minutes, set: setMinutes, hint: "optional" },
    { label: "Punkte", value: points, set: setPoints, hint: "" },
    { label: "Assists", value: assists, set: setAssists, hint: "" },
    { label: "Rebounds", value: rebounds, set: setRebounds, hint: "" },
    { label: "Steals", value: steals, set: setSteals, hint: "" },
  ] as const;

  const heading = resolvedContext === "game" ? "Spiel tracken" : "Spieltraining tracken";

  return (
    <main className="app-container animate-in">
      <div className="mx-auto max-w-2xl">
        <header>
          <p className="page-eyebrow">{modeBadge}</p>
          <h1 className="page-title">{heading}</h1>
          {editId ? (
            <p className="mt-1 text-xs text-amber-300">Eintrag bearbeiten – Änderungen überschreiben den bestehenden Eintrag.</p>
          ) : null}
        </header>

        <section className="mt-5 app-card">
          <p className="section-eyebrow">Kontext</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="input-label">Datum</label>
              <input
                type="date"
                value={resolvedDate}
                onChange={(e) => setResolvedDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="input-label">Art</label>
              <select
                value={resolvedContext}
                onChange={(e) => setResolvedContext(e.target.value as "game" | "game_training")}
                className="select"
              >
                <option value="game">Spieltag</option>
                <option value="game_training">Spieltraining</option>
              </select>
            </div>
          </div>
        </section>

        <section className="mt-4 app-card--accent-violet">
          <p className="section-eyebrow">Gegner</p>
          <label className="input-label mt-2" htmlFor="opponent">Spiel / Gegner</label>
          <input
            id="opponent"
            value={opponentLabel}
            onChange={(e) => setOpponentLabel(e.target.value)}
            placeholder="z. B. Team XYZ, Hallenturnier …"
            className="input"
          />
          <p className="mt-1 text-xs text-muted">So erkennst du später in der Suche, gegen wen du gespielt hast.</p>

          <p className="section-eyebrow mt-5">Box Score</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {statFields.map((field) => (
              <div key={field.label}>
                <label className="input-label">
                  {field.label}
                  {field.hint ? <span className="text-faint"> ({field.hint})</span> : null}
                </label>
                <input
                  value={field.value}
                  onChange={(e) => field.set(e.target.value)}
                  inputMode="numeric"
                  placeholder="–"
                  className="input tabular-nums"
                />
              </div>
            ))}
          </div>

          <div className="mt-3">
            <label className="input-label">Notizen</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional: Fokus, Gefühl auf dem Feld …"
              className="textarea"
            />
          </div>

          <button
            type="button"
            disabled={saving}
            className="btn btn-violet btn-block mt-5"
            onClick={() => {
              setSaving(true);
              void saveGameStatAndSync({
                id: editId ?? undefined,
                date: resolvedDate,
                context: resolvedContext,
                opponentLabel: opponentLabel.trim() || null,
                minutes: toNullableNumber(minutes),
                points: toNullableNumber(points),
                assists: toNullableNumber(assists),
                rebounds: toNullableNumber(rebounds),
                steals: toNullableNumber(steals),
                notes: notes.trim() || undefined,
              }).finally(() => {
                setSaving(false);
                setSaved(true);
              });
            }}
          >
            {saving ? "Speichern …" : editId ? "Änderungen speichern & synchronisieren" : "Spiel-Stats speichern & synchronisieren"}
          </button>
          {saved ? <p className="mt-3 text-center text-sm text-emerald-300">Gespeichert und mit dem Konto synchronisiert (falls eingeloggt).</p> : null}
        </section>

        <Link href="/Weekly-Workout" className="btn btn-ghost btn-sm mt-6">
          ← Zurück zu Weekly
        </Link>
      </div>
    </main>
  );
}
