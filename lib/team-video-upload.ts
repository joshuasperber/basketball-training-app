import { getSupabasePublicConfig } from "@/lib/supabase-env";

export function uploadTeamVideoToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const config = getSupabasePublicConfig();
    const request = new XMLHttpRequest();
    request.open("PUT", signedUrl);
    request.setRequestHeader("x-upsert", "false");
    if (config.anonKey) {
      request.setRequestHeader("apikey", config.anonKey);
      request.setRequestHeader("Authorization", `Bearer ${config.anonKey}`);
    }

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(new Error(`Storage-Upload fehlgeschlagen (${request.status}).`));
    });
    request.addEventListener("error", () => reject(new Error("Netzwerkfehler beim Video-Upload.")));
    request.addEventListener("abort", () => reject(new Error("Video-Upload abgebrochen.")));

    const formData = new FormData();
    formData.append("cacheControl", "3600");
    formData.append("", file);
    request.send(formData);
  });
}

export async function readVideoDuration(file: File): Promise<number | null> {
  if (typeof document === "undefined") return null;
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;
    const finish = (duration: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanUp();
      resolve(duration);
    };
    const cleanUp = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };
    const timeoutId = window.setTimeout(() => finish(null), 5_000);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? Math.round(video.duration) : null;
      finish(duration);
    };
    video.onerror = () => finish(null);
    video.src = objectUrl;
  });
}
