export function zonedDateParts(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
  } catch {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes() };
  }
}

export function zonedDateMinuteKey(date: Date, timeZone: string) {
  const parts = zonedDateParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

export function isGameReminderDue(options: {
  date: string;
  startTime?: string;
  reminderMinutes: number;
  timeZone: string;
  now?: Date;
  toleranceMinutes?: number;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date) || !/^\d{2}:\d{2}$/.test(options.startTime ?? "")) return false;
  const [year, month, day] = options.date.split("-").map(Number);
  const [hour, minute] = (options.startTime ?? "").split(":").map(Number);
  const gameWallClock = Date.UTC(year, month - 1, day, hour, minute);
  const nowWallClock = zonedDateMinuteKey(options.now ?? new Date(), options.timeZone);
  const minutesUntil = Math.round((gameWallClock - nowWallClock) / 60_000);
  const tolerance = options.toleranceMinutes ?? 15;
  return minutesUntil <= options.reminderMinutes && minutesUntil > options.reminderMinutes - tolerance;
}

export function isWallClockDue(options: { date: string; time: string; timeZone: string; now?: Date; toleranceMinutes?: number }) {
  return isGameReminderDue({
    date: options.date,
    startTime: options.time,
    reminderMinutes: 0,
    timeZone: options.timeZone,
    now: options.now,
    toleranceMinutes: options.toleranceMinutes,
  });
}
