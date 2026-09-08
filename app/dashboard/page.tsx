import DashboardClient from "./DashboardClient";
import type { MessageKey } from "@/lib/i18n/messages";
import { toLocalDateKey } from "@/lib/workout";

export default function DashboardPage() {
  const now = new Date();
  const hour = now.getHours();
  const initialGreetingKey: MessageKey =
    hour < 5
      ? "dashboard.greetingNight"
      : hour < 11
        ? "dashboard.greetingMorning"
        : hour < 18
          ? "dashboard.greetingHi"
          : "dashboard.greetingEvening";

  return (
    <DashboardClient
      initialDateKey={toLocalDateKey(now)}
      initialDayIndex={now.getDay()}
      initialGreetingKey={initialGreetingKey}
    />
  );
}
