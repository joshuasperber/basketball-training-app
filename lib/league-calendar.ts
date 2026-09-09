import type { LeagueScheduleEntry } from "@/lib/league";

export type LeagueCalendarEvent = {
  title: string;
  start: string;
  end: string;
  location: string;
  description: string;
};

function compactDateTime(dateKey: string, time = "18:00") {
  return `${dateKey.replaceAll("-", "")}T${time.replace(":", "")}00`;
}

function addMinutes(dateKey: string, time: string, minutes: number) {
  const date = new Date(`${dateKey}T${time}:00`);
  date.setMinutes(date.getMinutes() + minutes);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}00`;
}

function escapeIcs(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

export function buildLeagueCalendarEvent(
  entry: LeagueScheduleEntry,
  resolveTeamName: (teamId: string | undefined) => string,
): LeagueCalendarEvent {
  const home = resolveTeamName(entry.homeTeamId) || "Heimteam";
  const away = resolveTeamName(entry.awayTeamId) || "Auswärtsteam";
  const time = entry.startTime ?? "18:00";
  const location = [entry.venueName, entry.venueAddress].filter(Boolean).join(", ");
  const description = [
    entry.kind === "game" ? "Ligaspiel" : "Test-/Trainingsspiel",
    entry.meetingTime ? `Treffpunkt: ${entry.meetingTime} Uhr` : null,
    entry.travelMinutes != null ? `Anfahrt: ca. ${entry.travelMinutes} Minuten` : null,
    entry.notes?.trim() || null,
  ].filter(Boolean).join("\n");
  return {
    title: `${home} – ${away}`,
    start: compactDateTime(entry.date, time),
    end: addMinutes(entry.date, time, 120),
    location,
    description,
  };
}

export function buildLeagueCalendarIcs(
  entries: LeagueScheduleEntry[],
  resolveTeamName: (teamId: string | undefined) => string,
) {
  const events = entries.map((entry) => {
    const event = buildLeagueCalendarEvent(entry, resolveTeamName);
    return [
      "BEGIN:VEVENT",
      `UID:${escapeIcs(entry.id)}@basketball-training-app`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
      `DTSTART:${event.start}`,
      `DTEND:${event.end}`,
      `SUMMARY:${escapeIcs(event.title)}`,
      event.location ? `LOCATION:${escapeIcs(event.location)}` : null,
      event.description ? `DESCRIPTION:${escapeIcs(event.description)}` : null,
      entry.status === "cancelled" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcs(`Morgen: ${event.title}`)}`,
      "END:VALARM",
      "BEGIN:VALARM",
      "TRIGGER:-PT2H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcs(`In zwei Stunden: ${event.title}`)}`,
      "END:VALARM",
      "END:VEVENT",
    ].filter(Boolean).join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Basketball Training App//Liga//DE", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
}

export function buildGoogleCalendarUrl(
  entry: LeagueScheduleEntry,
  resolveTeamName: (teamId: string | undefined) => string,
) {
  const event = buildLeagueCalendarEvent(entry, resolveTeamName);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${event.start}/${event.end}`,
    details: event.description,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadLeagueCalendar(filename: string, content: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
