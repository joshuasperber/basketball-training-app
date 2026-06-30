export function teamJoinErrorMessage(
  status: number,
  error?: string | null,
): string {
  if (status === 401) {
    return "Bitte zuerst einloggen (Account 2), dann den Einladungslink erneut öffnen oder den Token einfügen.";
  }
  if (error === "invite_not_found" || status === 404) {
    return "Einladungs-Token unbekannt. Vom Team-Owner „Einladungslink kopieren“ nutzen oder neue Einladung erstellen lassen.";
  }
  if (error === "invite_expired" || error === "invite_exhausted") {
    return "Einladung abgelaufen oder bereits aufgebraucht — im Team eine neue Einladung erstellen.";
  }
  if (error === "join_failed" || status === 500) {
    return "Beitritt technisch fehlgeschlagen. Prüfe, ob teams.sql in Supabase ausgeführt wurde.";
  }
  if (error === "invalid_token") {
    return "Kein gültiger Einladungs-Token (Format: bt-… mit 20 Zeichen).";
  }
  return "Beitritt fehlgeschlagen — Token ungültig oder abgelaufen.";
}
