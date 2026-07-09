This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, install dependencies and run the development server:

```bash
npm install
npm run dev
```

## Roadmap, Grenzen & Datenverhalten

### Umgesetzt (mit bekannten Limits)

- **Team-Modus:** Teams erstellen/beitreten, Rollen (owner/captain/player/coach), Freigabe-Stufen, Scouting und Team-Coach. Kein vollständiges gemeinsames Wochenplan-Editing für alle Spieler:innen.
- **Shooting-Zonen / Heatmap:** Zone-Splits und Heatmap in Stats vorhanden; Klassifikation aus Übungsnamen ist heuristisch und oft unvollständig.

### Bewusst noch offen / hoher Aufwand

- **Gemeinsamer Team-Wochenplan** mit feingranularer RLS und Live-Sharing über Geräte hinweg.
- **Tiefere Game-Heatmap** direkt aus Spiel-Tracking (nicht nur Training-Heuristik), eng mit Korrelations-Dashboard verzahnt.

### RPE, Dauer und Coach-Daten (aktuelles Verhalten)

**Neu oder geändert gespeicherte bzw. abgeschlossene Workouts** legen **RPE** und **Session-Dauer** so ab, dass die **Aktivitätskarte** und **Coach-/Planungsdaten** davon profitieren.

**Ältere Sessions** enthalten diese Felder oft noch nicht. Dann erscheint RPE (und die abgeleiteten Auswertungen) erst, wenn du die betreffenden Workouts **neu abschließt** bzw. die Daten erneut erfasst werden — **nur neu abgeschlossene** Workouts füllen die Felder zuverlässig automatisch.

### Vision / nächste große Schritte

- **Trainings-Partner-Modus vertiefen:** Eltern/Trainer:innen sehen Fortschritt read-only; gemeinsamer Plan.
- **Game-Stats:** Wurfquoten pro Zone aus Spiel-Tracking + stärkere Heatmap.
- **KI-generierter Wochenplan auf Knopfdruck:** Vollständigen Weekly-Plan-Vorschlag übernehmen (Anknüpfung: `/api/coach`).
