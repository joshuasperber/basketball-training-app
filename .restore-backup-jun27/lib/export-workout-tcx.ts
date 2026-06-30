import type { WorkoutSessionEntry } from "@/lib/session-storage";

const TCX_NS = "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isoUtcForTcx(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function estimateSessionSeconds(session: WorkoutSessionEntry): number {
  if (typeof session.durationSeconds === "number" && session.durationSeconds >= 60) {
    return Math.round(session.durationSeconds);
  }
  return Math.max(300, session.logs.length * 180);
}

/**
 * Ein TCX-Dokument mit mehreren `<Activity>`-Einträgen (z. B. für Strava / Garmin / Health-Import).
 */
export function buildTrainingCenterTcx(sessions: WorkoutSessionEntry[]): string {
  const exportable = sessions.filter((s) => s.workoutId !== "single-exercise-session");
  const activityBlocks = exportable.map((session) => {
    const start = new Date(session.dateISO);
    const secs = estimateSessionSeconds(session);
    const end = new Date(start.getTime() + secs * 1000);
    const title = escapeXml(session.workoutName || "Workout");
    const note = (session.sessionNotes ?? "").trim();
    const notes = escapeXml(note || `${title} · ${session.logs.length} Sätze`);
    const startIso = isoUtcForTcx(start);
    const endIso = isoUtcForTcx(end);
    return `    <Activity Sport="Other">
      <Name>${title}</Name>
      <Id>${startIso}</Id>
      <Lap StartTime="${startIso}">
        <TotalTimeSeconds>${secs}</TotalTimeSeconds>
        <DistanceMeters>0</DistanceMeters>
        <Calories>0</Calories>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Notes>${notes}</Notes>
        <Track>
          <Trackpoint>
            <Time>${startIso}</Time>
          </Trackpoint>
          <Trackpoint>
            <Time>${endIso}</Time>
          </Trackpoint>
        </Track>
      </Lap>
    </Activity>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="${TCX_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${TCX_NS} http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Activities>
${activityBlocks.join("\n")}
  </Activities>
</TrainingCenterDatabase>`;
}

export function downloadWorkoutSessionsTcx(filenameBase: string, sessions: WorkoutSessionEntry[]) {
  const xml = buildTrainingCenterTcx(sessions);
  const blob = new Blob([xml], { type: "application/vnd.garmin.tcx+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filenameBase.endsWith(".tcx") ? filenameBase : `${filenameBase}.tcx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
