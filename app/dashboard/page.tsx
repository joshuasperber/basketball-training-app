import { supabase } from "@/lib/supabase";

type DashboardKpiRow = {
  sessions_7d: number | null;
  sessions_30d: number | null;
  minutes_7d: number | null;
  minutes_30d: number | null;
  makes_30d: number | null;
  attempts_30d: number | null;
  fg_pct_30d: number | null;
  active_days_30d: number | null;
  last_session_date: string | null;
};

type SessionRow = {
  session_date: string | null;
  total_duration_min: number | null;
};

type ItemRow = {
  made: number | null;
  attempts: number | null;
};

function isoDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const { data: kpiData, error: kpiError } = await supabase
    .from("dashboard_kpis_30d")
    .select(
      "sessions_7d, sessions_30d, minutes_7d, minutes_30d, makes_30d, attempts_30d, fg_pct_30d, active_days_30d, last_session_date"
    )
    .limit(1)
    .maybeSingle<DashboardKpiRow>();

  let totalSessions = 0;
  let totalMinutes = 0;
  let totalMade = 0;
  let totalAttempts = 0;
  let sessions7d = 0;
  let minutes7d = 0;
  let activeDays30d = 0;

  let errorMessage: string | null = null;

  if (kpiData) {
    totalSessions = kpiData.sessions_30d ?? 0;
    totalMinutes = kpiData.minutes_30d ?? 0;
    totalMade = kpiData.makes_30d ?? 0;
    totalAttempts = kpiData.attempts_30d ?? 0;
    sessions7d = kpiData.sessions_7d ?? 0;
    minutes7d = kpiData.minutes_7d ?? 0;
    activeDays30d = kpiData.active_days_30d ?? 0;
  } else {
    const [{ data: sessions, error: sessionsError }, { data: items, error: itemsError }] =
      await Promise.all([
        supabase
          .from("workout_sessions")
          .select("session_date, total_duration_min")
          .gte("session_date", isoDateDaysAgo(30)),
        supabase.from("workout_session_items").select("made, attempts"),
      ]);

    if (sessionsError || itemsError) {
      errorMessage =
        kpiError?.message ?? sessionsError?.message ?? itemsError?.message ?? "Unknown error";
    } else {
      const sessionRows = (sessions ?? []) as SessionRow[];
      const itemRows = (items ?? []) as ItemRow[];

      totalSessions = sessionRows.length;
      totalMinutes = sessionRows.reduce((sum, row) => sum + (row.total_duration_min ?? 0), 0);

      const sevenDayCutoff = isoDateDaysAgo(7);
      const activeDays = new Set<string>();

      for (const session of sessionRows) {
        if (!session.session_date) continue;

        activeDays.add(session.session_date);

        if (session.session_date >= sevenDayCutoff) {
          sessions7d += 1;
          minutes7d += session.total_duration_min ?? 0;
        }
      }

      activeDays30d = activeDays.size;
      totalMade = itemRows.reduce((sum, item) => sum + (item.made ?? 0), 0);
      totalAttempts = itemRows.reduce((sum, item) => sum + (item.attempts ?? 0), 0);
    }
  }

  const fgPercent =
    totalAttempts > 0 ? Math.round((totalMade / totalAttempts) * 100) : 0;

  return (
    <main className="min-h-screen bg-black p-6 pb-24 text-white">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-2 text-zinc-400">Überblick über deine Trainingsdaten (7 / 30 Tage).</p>

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-300">
            Fehler beim Laden: {errorMessage}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Sessions (7d)</p>
              <p className="mt-2 text-3xl font-bold">{sessions7d}</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Sessions (30d)</p>
              <p className="mt-2 text-3xl font-bold">{totalSessions}</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Minuten (7d)</p>
              <p className="mt-2 text-3xl font-bold">{minutes7d}</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Minuten (30d)</p>
              <p className="mt-2 text-3xl font-bold">{totalMinutes}</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Treffer (30d)</p>
              <p className="mt-2 text-3xl font-bold">{totalMade}</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">FG% (30d)</p>
              <p className="mt-2 text-3xl font-bold">{fgPercent}%</p>
            </div>

            <div className="col-span-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Aktive Tage (30d)</p>
              <p className="mt-2 text-3xl font-bold">{activeDays30d}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}