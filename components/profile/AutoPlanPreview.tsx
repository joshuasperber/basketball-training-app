"use client";

import { type PlannedSlot } from "@/lib/auto-day-planner";
import { type DayKey } from "@/lib/planner";

const DAY_LABEL: Record<DayKey, string> = {
  monday: "Montag",
  tuesday: "Dienstag",
  wednesday: "Mittwoch",
  thursday: "Donnerstag",
  friday: "Freitag",
  saturday: "Samstag",
  sunday: "Sonntag",
};

function badgeClass(type: PlannedSlot["sessionType"]) {
  if (type === "basketball") return "border-blue-500 bg-blue-600/20 text-blue-100";
  if (type === "gym") return "border-amber-500 bg-amber-600/20 text-amber-100";
  if (type === "recovery") return "border-emerald-500 bg-emerald-600/20 text-emerald-100";
  return "border-zinc-600 bg-zinc-800 text-zinc-300";
}

export default function AutoPlanPreview({ slots }: { slots: PlannedSlot[] }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h3 className="text-lg font-semibold">Automatische Tagesplanung</h3>
      <p className="mt-1 text-sm text-zinc-400">
        Konkrete Slots mit Zeitbudget, inkl. Tages-Regel „nur Basketball/Gym möglich“.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {slots.map((slot) => (
          <article key={slot.day} className="rounded-xl border border-zinc-700 bg-zinc-950 p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">{DAY_LABEL[slot.day]}</p>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeClass(slot.sessionType)}`}>
                {slot.sessionType}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-300">{slot.minutes} Min</p>
            <p className="mt-1 text-xs text-zinc-500">{slot.reason}</p>
          </article>
        ))}
      </div>
    </section>
  );
}