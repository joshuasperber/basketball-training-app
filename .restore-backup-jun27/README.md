This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, install dependencies and run the development server:

```bash
npm install
npm run dev
```

## Roadmap, Grenzen & Datenverhalten

### Hoher Aufwand (bewusst nicht umgesetzt)

Diese Bereiche würden eigene Architektur-, Datenbank- und UI-Arbeit erfordern und sind im aktuellen Stand **nicht** im Produkt enthalten:

- **Trainings-Partner-Modus** über Supabase (Teams, Einladungs-/Sharing-Tokens, Row Level Security), sodass mehrere Spieler:innen eines Teams Pläne teilen können.
- **Shot-Map / Heatmap** und eine deutlich tiefere Auswertung von Game-Stats (z. B. Wurfquoten pro Zone) inklusive stärkerer Verzahnung mit dem Game-Korrelations-Dashboard.

### RPE, Dauer und Coach-Daten (aktuelles Verhalten)

**Neu oder geändert gespeicherte bzw. abgeschlossene Workouts** legen **RPE** und **Session-Dauer** so ab, dass die **Aktivitätskarte** und **Coach-/Planungsdaten** davon profitieren.

**Ältere Sessions** enthalten diese Felder oft noch nicht. Dann erscheint RPE (und die abgeleiteten Auswertungen) erst, wenn du die betreffenden Workouts **neu abschließt** bzw. die Daten erneut erfasst werden — **nur neu abgeschlossene** Workouts füllen die Felder zuverlässig automatisch.

### Hoher Impact, hoher Aufwand (Vision / nächste große Schritte)

- **Trainings-Partner-Modus:** Mehrere Spieler:innen eines Teams teilen einen Plan (z. B. read-only für Teammitglieder); Eltern oder Trainer:innen sehen den Fortschritt. Technisch: Team-Tabelle in Supabase, Sharing-Tokens, RLS.
- **Game-Stats:** Aus dem heutigen Aggregat (Punkte, Assists, …) weiter zu **Wurfquoten pro Zone** und einer **Heatmap** — eng mit dem bestehenden Game-Stats-/Korrelations-Dashboard verbunden.
- **KI-generierter Wochenplan auf Knopfdruck:** Analog zum Coach-Flow, aber das LLM liefert einen **vollständigen Weekly-Plan-Vorschlag**, den du mit einem Klick übernehmen kannst. Natürlicher Anknüpfungspunkt: die bestehende **`/api/coach`-Route** und die Wochenplan-/Profil-Datenstrukturen.
