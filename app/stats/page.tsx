import { supabase } from "@/lib/supabase";

type SessionRow = {
  id: string;
  session_date: string | null;
  total_duration_min: number | null;
  notes: string | null;
};

type ItemRow = {
  made: number | null;
  attempts: number | null;
  duration_sec: number | null;
};

export default async function StatsPage() {
  const [{ data: sessions, error: sessionsError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase
        .from("workout_sessions")
        .select("id, session_date, total_duration_min, notes")
        .order("session_date", { ascending: false })
        .limit(10),
      supabase.from("workout_session_items").select("made, attempts, duration_sec"),
    ]);

  const sessionRows = (sessions ?? []) as SessionRow[];
  const itemRows = (items ?? []) as ItemRow[];

  const totalSessions = sessionRows.length;
  const totalMinutes = sessionRows.reduce((sum, s) => sum + (s.total_duration_min ?? 0), 0);
  const totalMade = itemRows.reduce((sum, i) => sum + (i.made ?? 0), 0);
  const totalAttempts = itemRows.reduce((sum, i) => sum + (i.attempts ?? 0), 0);
  const totalDurationSec = itemRows.reduce((sum, i) => sum + (i.duration_sec ?? 0), 0);

  const fgPercent = totalAttempts > 0 ? Math.round((totalMade / totalAttempts) * 100) : 0;
  const avgSessionMinutes = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;

  return (
    <main className="min-h-screen bg-zinc-950 p-6 pb-24 text-white">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-bold">Statistiken</h1>
        <p className="text-zinc-400">Alle Kennzahlen werden live aus deinen Supabase-Testdaten berechnet.</p>

        {(sessionsError || itemsError) && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-300">
            Fehler beim Laden: {sessionsError?.message ?? itemsError?.message}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-400">Sessions</p>
            <p className="mt-1 text-2xl font-semibold">{totalSessions}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-400">FG%</p>
            <p className="mt-1 text-2xl font-semibold">{fgPercent}%</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-400">Ø Minuten/Session</p>
            <p className="mt-1 text-2xl font-semibold">{avgSessionMinutes}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-400">Drill-Zeit (sek)</p>
            <p className="mt-1 text-2xl font-semibold">{totalDurationSec}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm font-medium text-zinc-200">Letzte Sessions</p>
          <div className="mt-3 space-y-2">
            {sessionRows.length === 0 ? (
              <p className="text-sm text-zinc-400">Keine Session-Daten vorhanden.</p>
            ) : (
              sessionRows.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">
                      {session.session_date ?? "ohne Datum"}
                    </p>
                    <p className="text-xs text-zinc-400">{session.notes ?? "Keine Notiz"}</p>
                  </div>
                  <p className="text-sm font-semibold text-zinc-200">
                    {session.total_duration_min ?? 0} min
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}