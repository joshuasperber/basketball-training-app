/** Browser-Online-Status — zentral für Offline-first Verhalten. */
export function isAppOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}
