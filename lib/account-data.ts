import { buildLocalProgressSnapshot } from "@/lib/progress-sync";
import { fetchAuthMe } from "@/lib/auth-session-align";

export async function downloadFullUserExport() {
  const me = await fetchAuthMe();
  const local = buildLocalProgressSnapshot();
  let cloud: unknown = null;

  if (me) {
    const cloudRes = await fetch("/api/account/export", { credentials: "same-origin" });
    if (cloudRes.ok) {
      cloud = await cloudRes.json();
    }
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    account: me ? { id: me.id, email: me.email } : null,
    local,
    cloud,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `basketball-training-full-export-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function deleteAccountAndLocalData(): Promise<{ ok: boolean; message: string }> {
  const response = await fetch("/api/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ confirm: "DELETE" }),
  });

  if (response.status === 401) {
    return { ok: false, message: "Bitte zuerst einloggen." };
  }
  if (!response.ok) {
    return { ok: false, message: "Konto konnte nicht gelöscht werden." };
  }

  if (typeof window !== "undefined") {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.location.href = "/login";
  }

  return { ok: true, message: "Konto und lokale Daten wurden gelöscht." };
}
