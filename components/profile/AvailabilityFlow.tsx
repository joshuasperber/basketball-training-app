"use client";

import { type DayKey } from "@/lib/planner";
import { type DayAvailability } from "@/lib/auto-day-planner";

type Props = {
  value: DayAvailability[];
  onChange: (next: DayAvailability[]) => void;
};

const DAY_LABEL: Record<DayKey, string> = {
  monday: "Montag",
  tuesday: "Dienstag",
  wednesday: "Mittwoch",
  thursday: "Donnerstag",
  friday: "Freitag",
  saturday: "Samstag",
  sunday: "Sonntag",
};

const DAY_ORDER: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function updateDay(
  days: DayAvailability[],
  day: DayKey,
  patch: Partial<DayAvailability>,
): DayAvailability[] {
  return days.map((entry) => (entry.day === day ? { ...entry, ...patch } : entry));
}

export default function AvailabilityFlow({ value, onChange }: Props) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="text-lg font-semibold">Wann passt es?</h3>
      <p className="mt-1 text-sm text-zinc-400">
        Stelle pro Tag ein, ob du verfügbar bist, wie viel Zeit du hast und ob Basketball/Gym möglich ist.
      </p>

      <div className="mt-4 space-y-3">
        {DAY_ORDER.map((day) => {
          const row = value.find((v) => v.day === day);
          if (!row) return null;

          return (
            <div key={day} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{DAY_LABEL[day]}</p>

                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={row.available}
                    onChange={(e) =>
                      onChange(updateDay(value, day, { available: e.target.checked }))
                    }
                  />
                  Verfügbar
                </label>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-sm text-zinc-300">
                  Minuten
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={row.minutes}
                    disabled={!row.available}
                    onChange={(e) =>
                      onChange(
                        updateDay(value, day, {
                          minutes: Math.max(0, Math.min(180, Number(e.target.value) || 0)),
                        }),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={row.allowedSessionTypes.includes("basketball")}
                    disabled={!row.available}
                    onChange={(e) => {
                      const set = new Set(row.allowedSessionTypes);
                      if (e.target.checked) set.add("basketball");
                      else set.delete("basketball");
                      onChange(updateDay(value, day, { allowedSessionTypes: Array.from(set) as Array<"basketball" | "gym"> }));
                    }}
                  />
                  Basketball möglich
                </label>

                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={row.allowedSessionTypes.includes("gym")}
                    disabled={!row.available}
                    onChange={(e) => {
                      const set = new Set(row.allowedSessionTypes);
                      if (e.target.checked) set.add("gym");
                      else set.delete("gym");
                      onChange(updateDay(value, day, { allowedSessionTypes: Array.from(set) as Array<"basketball" | "gym"> }));
                    }}
                  />
                  Gym möglich
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}