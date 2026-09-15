This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, install dependencies and run the development server:

```bash
npm install
npm run dev
```

## Roadmap, Grenzen & Datenverhalten

### Umgesetzt (mit bekannten Limits)

- **Team- und Liga-Modus:** Teams erstellen/beitreten, Rollen (owner/captain/player/coach), gemeinsame Liga mit Konfliktschutz und Änderungshistorie, wiederverwendbare Gegner, Kader, Scouting, Ergebnisse, Tabelle, Boxscores und Live-Spielmodus.
- **Team-Videothek:** Mitglieder und Coaches laden Offense-/Defense-Clips direkt in einen privaten Supabase-Bucket; nur Teammitglieder erhalten zeitlich begrenzte Wiedergabe-Links.
- **Game Center:** Organisation, Zu-/Absagen, Start-Five, Scouting, Live-Modus, persönliche Stats und Auswertung sind pro Spiel gebündelt.
- **Kalender:** Einzeltermine können exportiert werden; verbundene Teams erhalten zusätzlich einen widerrufbaren iCal-Abonnement-Link.
- **Trainingssteuerung:** Ein kurzer Tagesform-Check erzeugt einen fokussierten nächsten Schritt auf dem Dashboard und wird optional über die Cloud synchronisiert.
- **Benachrichtigungen:** Lokale Reminder sowie opt-in Server-Push für Trainings, Spiele, Zusagefristen und Spielplanänderungen.
- **Shooting-Zonen / Heatmap:** Zone-Splits und Heatmap in Stats vorhanden; Klassifikation aus Übungsnamen ist heuristisch und oft unvollständig.
- **Qualitätssicherung:** Unit-/Integrationstests sowie Browser-, Mobile- und automatische Accessibility-Smoke-Tests laufen in CI.

### Bewusst noch offen / hoher Aufwand

- **Gemeinsamer Team-Wochenplan** mit feingranularer RLS und Live-Sharing über Geräte hinweg.
- **Tiefere Game-Heatmap** direkt aus Spiel-Tracking (nicht nur Training-Heuristik), eng mit Korrelations-Dashboard verzahnt.

### RPE, Dauer und Coach-Daten (aktuelles Verhalten)

**Neu oder geändert gespeicherte bzw. abgeschlossene Workouts** legen **RPE** und **Session-Dauer** so ab, dass die **Aktivitätskarte** und **Coach-/Planungsdaten** davon profitieren.

**Ältere Sessions** enthalten diese Felder oft noch nicht. Dann erscheint RPE (und die abgeleiteten Auswertungen) erst, wenn du die betreffenden Workouts **neu abschließt** bzw. die Daten erneut erfasst werden — **nur neu abgeschlossene** Workouts füllen die Felder zuverlässig automatisch.

### Vision / mögliche spätere Vertiefungen

- **Trainings-Partner-Modus vertiefen:** Eltern/Trainer:innen sehen Fortschritt read-only; gemeinsamer Plan.
- **Game-Stats:** Wurfquoten pro Zone aus Spiel-Tracking + stärkere Heatmap.
- **KI-generierter Wochenplan auf Knopfdruck:** Vollständigen Weekly-Plan-Vorschlag übernehmen (Anknüpfung: `/api/coach`).

## Push-Benachrichtigungen

Die App unterstützt opt-in Web Push für Trainings-Erinnerungen, Spielplanänderungen, Zusagefristen und bevorstehende Spiele.

1. Migrationen aus `supabase/migrations` deployen. Für dieses Upgrade sind insbesondere diese Dateien erforderlich:
   - `20260915120000_team_league_version_history.sql`
   - `20260915130000_push_subscriptions.sql`
   - `20260915140000_calendar_feed_tokens.sql`
   - `20260915150000_team_video_library.sql`
2. Ein VAPID-Schlüsselpaar erzeugen, z. B. mit `npx web-push generate-vapid-keys`.
3. In Vercel und lokal setzen:
   - `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_VAPID_PRIVATE_KEY`
   - `WEB_PUSH_VAPID_SUBJECT` (z. B. `mailto:admin@example.com`)
   - `CRON_SECRET` (langer zufälliger Wert)
4. `CRON_SECRET` zusätzlich als GitHub-Secret und `PRODUCTION_URL` als GitHub-Variable hinterlegen. Der Workflow `Notification dispatch` ruft den geschützten Versand alle 15 Minuten auf.

Ohne diese Variablen bleibt der bestehende lokale Browser-Reminder aktiv; die App schlägt dadurch nicht fehl.
