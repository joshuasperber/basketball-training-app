"use client";

import GradientFadeList from "@/components/GradientFadeList";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadGameStats } from "@/lib/game-stats";
import { normalizeGameStatBatch } from "@/lib/game-stat-batch";
import { saveGameStatAndSync } from "@/lib/services/game-stats-sync";
import { deleteGamePhoto, getGamePhotoUrl, uploadGamePhoto } from "@/lib/game-photo-storage";
import { loadPerformanceTips } from "@/lib/performance-tips";
import { loadWorkouts } from "@/lib/training-storage";
import { getWarmupWorkouts } from "@/lib/warmup-workouts";
import {
  OPPONENT_STYLE_LABELS,
  OPPONENT_STYLE_TAGS,
  toggleOpponentStyle,
  type OpponentStyleTag,
} from "@/lib/opponent-styles";

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
  const [teamFormat, setTeamFormat] = useState("5v5");
  const [customTeamFormat, setCustomTeamFormat] = useState("");
  const [gamesPlayed, setGamesPlayed] = useState("1");
  const [statsAreTotals, setStatsAreTotals] = useState(true);
  const [opponentStyles, setOpponentStyles] = useState<OpponentStyleTag[]>([]);
  const [minutes, setMinutes] = useState("");
  const [intensity, setIntensity] = useState("");
  const [points, setPoints] = useState("");
  const [assists, setAssists] = useState("");
  const [rebounds, setRebounds] = useState("");
  const [steals, setSteals] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [warmupWorkouts, setWarmupWorkouts] = useState<ReturnType<typeof getWarmupWorkouts>>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (editId) {
        const entry = loadGameStats().find((item) => item.id === editId);
        if (entry) {
          setResolvedDate(entry.date);
          setResolvedContext(entry.context);
          setOpponentLabel(entry.opponentLabel ?? "");
          const savedFormat = entry.teamFormat ?? "5v5";
          if (["1v1", "2v2", "3v3", "4v4", "5v5"].includes(savedFormat)) {
            setTeamFormat(savedFormat);
            setCustomTeamFormat("");
          } else {
            setTeamFormat("custom");
            setCustomTeamFormat(savedFormat);
          }
          setGamesPlayed(String(entry.gamesPlayed ?? 1));
          setStatsAreTotals(entry.statsAreTotals ?? true);
          setOpponentStyles(entry.opponentStyles ?? []);
          setMinutes(entry.minutes != null ? String(entry.minutes) : "");
          setIntensity(entry.intensity != null ? String(entry.intensity) : "");
          setPoints(entry.points != null ? String(entry.points) : "");
          setAssists(entry.assists != null ? String(entry.assists) : "");
          setRebounds(entry.rebounds != null ? String(entry.rebounds) : "");
          setSteals(entry.steals != null ? String(entry.steals) : "");
          setNotes(entry.notes ?? "");
          setPhotoPath(entry.photoPath ?? null);
          setSaved(false);
          return;
        }
      }
      setResolvedDate(paramDate);
      setResolvedContext(paramContext);
      setOpponentLabel("");
      setTeamFormat("5v5");
      setCustomTeamFormat("");
      setGamesPlayed("1");
      setStatsAreTotals(true);
      setOpponentStyles([]);
      setMinutes("");
      setIntensity("");
      setPoints("");
      setAssists("");
      setRebounds("");
      setSteals("");
      setNotes("");
      setPhotoPath(null);
      setPhotoUrl(null);
      setSaved(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editId, paramDate, paramContext]);

  useEffect(() => {
    if (!photoPath) {
      setPhotoUrl(null);
      return;
    }
    let cancelled = false;
    void getGamePhotoUrl(photoPath).then((url) => {
      if (!cancelled) setPhotoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const targetId = editId ?? `pending-${Date.now()}`;
      const newPath = await uploadGamePhoto(targetId, file);
      if (photoPath) {
        await deleteGamePhoto(photoPath).catch(() => undefined);
      }
      setPhotoPath(newPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Foto-Upload fehlgeschlagen.";
      setPhotoError(message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!photoPath) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await deleteGamePhoto(photoPath);
      setPhotoPath(null);
      setPhotoUrl(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Foto konnte nicht entfernt werden.";
      setPhotoError(message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const modeBadge = useMemo(
    () => (resolvedContext === "game" ? "Spieltag" : "Trainingsspiel"),
    [resolvedContext],
  );
  useEffect(() => {
    const syncWarmups = () => setWarmupWorkouts(getWarmupWorkouts(loadWorkouts()));
    syncWarmups();
    window.addEventListener("storage", syncWarmups);
    return () => window.removeEventListener("storage", syncWarmups);
  }, []);
  const prepNotes = useMemo(() => {
    const tips = loadPerformanceTips()
      .filter((tip) => tip.active)
      .map((tip) => `${tip.title}: ${tip.content}`);
    const gameNotes = loadGameStats()
      .filter((entry) => entry.date === resolvedDate && entry.context === resolvedContext && entry.notes?.trim())
      .map((entry) => entry.notes?.trim() ?? "");
    return [...tips, ...gameNotes];
  }, [resolvedContext, resolvedDate]);

  const statFields = [
    { label: "Minuten", value: minutes, set: setMinutes, hint: "optional" },
    { label: "Punkte", value: points, set: setPoints, hint: "" },
    { label: "Assists", value: assists, set: setAssists, hint: "" },
    { label: "Rebounds", value: rebounds, set: setRebounds, hint: "" },
    { label: "Steals", value: steals, set: setSteals, hint: "" },
  ] as const;

  const heading = resolvedContext === "game" ? "Spiel tracken" : "Trainingsspiel tracken";

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
                <option value="game_training">Trainingsspiel</option>
              </select>
            </div>
          </div>
        </section>

        <section className="mt-4 app-card--accent-violet">
          <p className="section-eyebrow">Gegner</p>
          <div className="mb-4 app-card--flat">
            <p className="text-sm font-semibold text-strong">Vorbereitung</p>
            {warmupWorkouts.length > 0 ? (
              <div className="mt-2 space-y-1">
                {warmupWorkouts.slice(0, 3).map((workout) => (
                  <p key={workout.id} className="text-xs text-muted">
                    Warm-Up verfügbar: <span className="text-strong">{workout.name}</span>
                    {workout.notes ? ` · ${workout.notes}` : ""}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs hint-warning">
                Noch kein Warm-Up-Workout vorhanden. Erstelle unter Training ein Basketball-Workout mit Unterkategorie Warm-Up.
              </p>
            )}
            {prepNotes.length > 0 ? (
              <GradientFadeList
                className="mt-3"
                items={prepNotes}
                listClassName="space-y-1"
                getKey={(note, index) => `${note}-${index}`}
                renderItem={(note) => <p className="text-xs text-muted">{note}</p>}
                showMoreLabel={(hiddenCount) => `Alle Notizen anzeigen (${hiddenCount})`}
              />
            ) : null}
          </div>
          <label className="input-label mt-2" htmlFor="opponent">Spiel / Gegner</label>
          <input
            id="opponent"
            value={opponentLabel}
            onChange={(e) => setOpponentLabel(e.target.value)}
            placeholder="z. B. Team XYZ, Hallenturnier …"
            className="input"
          />
          <p className="mt-1 text-xs text-muted">So erkennst du später in der Suche, gegen wen du gespielt hast.</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="input-label">Format</label>
              <select value={teamFormat} onChange={(e) => setTeamFormat(e.target.value)} className="select">
                <option value="1v1">1v1</option>
                <option value="2v2">2v2</option>
                <option value="3v3">3v3</option>
                <option value="4v4">4v4</option>
                <option value="5v5">5v5</option>
                <option value="custom">Andere</option>
              </select>
            </div>
            <div>
              <label className="input-label">Anzahl Spiele</label>
              <input
                value={gamesPlayed}
                onChange={(e) => setGamesPlayed(e.target.value.replace(/\D/g, "").slice(0, 2))}
                inputMode="numeric"
                className="input tabular-nums"
                placeholder="1"
              />
            </div>
          </div>
          {teamFormat === "custom" ? (
            <input
              value={customTeamFormat}
              onChange={(e) => setCustomTeamFormat(e.target.value)}
              className="input mt-2"
              placeholder="z. B. 4v4 + 1 Neutral"
            />
          ) : null}
          <label className="mt-3 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={statsAreTotals}
              onChange={(e) => setStatsAreTotals(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--surface-border-strong)]"
            />
            Werte sind Summe/Ø über alle Spiele — beim Speichern wird ein Durchschnitt pro Spiel berechnet.
          </label>

          <p className="input-label mt-4">Gegner-Stil (Matchup)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {OPPONENT_STYLE_TAGS.map((tag) => {
              const active = opponentStyles.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setOpponentStyles((current) => toggleOpponentStyle(current, tag))}
                  className={`chip ${active ? "chip-active" : ""}`}
                  aria-pressed={active}
                >
                  {OPPONENT_STYLE_LABELS[tag]}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted">Mehrfachauswahl möglich — fließt in Matchup-Tipps und später ins Team-Scouting ein.</p>

          <p className="section-eyebrow mt-5">Box Score</p>
          <div className="mt-3 app-card--flat">
            <label className="input-label">Intensität: {intensity || "5"}/10</label>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={intensity || "5"}
              onChange={(event) => setIntensity(event.target.value)}
              className="mt-3 w-full accent-violet-400"
            />
            <div className="mt-1 flex justify-between text-[10px] text-faint">
              <span>Locker</span>
              <span>Game Speed</span>
              <span>Max</span>
            </div>
          </div>
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

          <div className="mt-4">
            <label className="input-label">Foto (Live-Tafel / Score)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelected}
              className="hidden"
            />
            {photoUrl ? (
              <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--surface-border)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt="Game Score" className="block max-h-72 w-full object-cover" />
              </div>
            ) : (
              <div className="mt-2 rounded-2xl border border-dashed border-[var(--surface-border-strong)] bg-[var(--surface-strong)] p-4 text-center text-xs text-faint">
                Noch kein Foto hochgeladen.
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoBusy}
                className="btn btn-ghost btn-sm"
              >
                {photoBusy ? "Lädt …" : photoPath ? "Foto ändern" : "Foto hinzufügen"}
              </button>
              {photoPath ? (
                <button type="button" onClick={() => void handleRemovePhoto()} disabled={photoBusy} className="btn btn-ghost btn-sm">
                  Entfernen
                </button>
              ) : null}
            </div>
            {photoError ? <p className="mt-1 text-xs text-rose-600">{photoError}</p> : null}
            <p className="mt-1 text-[11px] text-faint">Bild wird komprimiert (max. 1600 px) und verschlüsselt in deinem Konto gespeichert.</p>
          </div>

          <button
            type="button"
            disabled={saving}
            className="btn btn-violet btn-block mt-5"
            onClick={() => {
              setSaving(true);
              const batch = normalizeGameStatBatch({
                minutes: toNullableNumber(minutes),
                intensity: toNullableNumber(intensity),
                points: toNullableNumber(points),
                assists: toNullableNumber(assists),
                rebounds: toNullableNumber(rebounds),
                steals: toNullableNumber(steals),
                gamesPlayed: Math.max(1, Number(gamesPlayed) || 1),
                statsAreTotals,
              });
              void saveGameStatAndSync({
                id: editId ?? undefined,
                date: resolvedDate,
                context: resolvedContext,
                opponentLabel: opponentLabel.trim() || null,
                opponentStyles,
                teamFormat: (teamFormat === "custom" ? customTeamFormat : teamFormat).trim() || null,
                ...batch,
                notes: notes.trim() || undefined,
                photoPath: photoPath ?? null,
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
