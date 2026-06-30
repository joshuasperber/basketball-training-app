import { supabase } from "@/lib/supabase";

/** Komprimiert ein Bild client-seitig auf max. ~1600 px lange Kante & JPEG q=0.8. */
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Server-Kontext"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
      img.onload = () => {
        const maxEdge = 1600;
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas-Context nicht verfügbar"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Bild konnte nicht komprimiert werden"));
              return;
            }
            resolve(blob);
          },
          "image/jpeg",
          0.82,
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadGamePhoto(gameId: string, file: File): Promise<string> {
  const compressed = await compressImage(file);
  const formData = new FormData();
  formData.append("file", compressed, "game-photo.jpg");
  formData.append("gameId", gameId);

  const response = await fetch("/api/game-photo", {
    method: "POST",
    body: formData,
    credentials: "same-origin",
  });

  if (response.status === 401) throw new Error("Nicht angemeldet – Upload nicht möglich.");
  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error ?? "Upload fehlgeschlagen.");
  }

  const json = (await response.json()) as { path?: string };
  if (!json.path) throw new Error("Upload-Pfad fehlt.");
  return json.path;
}

export async function getGamePhotoUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const response = await fetch(`/api/game-photo?path=${encodeURIComponent(path)}`, {
    credentials: "same-origin",
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { signedUrl?: string };
  return json.signedUrl ?? null;
}

export async function deleteGamePhoto(path: string): Promise<void> {
  if (!path) return;
  await fetch("/api/game-photo", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ path }),
  });
}
