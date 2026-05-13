import { supabase } from "@/lib/supabase";

const BUCKET = "game-photos";

type AuthClient = {
  auth?: {
    getUser?: () => Promise<{ data?: { user?: { id?: string } | null } }>;
  };
};

async function getCurrentUserId(): Promise<string | null> {
  const authApi = (supabase as unknown as AuthClient).auth;
  if (!authApi?.getUser) return null;
  const result = await authApi.getUser();
  return result?.data?.user?.id ?? null;
}

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
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Nicht angemeldet – Upload nicht möglich.");

  const compressed = await compressImage(file);
  const ext = "jpg";
  const path = `${userId}/${gameId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "3600",
    });
  if (error) throw error;
  return path;
}

export async function getGamePhotoUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function deleteGamePhoto(path: string): Promise<void> {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
