"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { hasOfflineSessionHint } from "@/lib/offline-session";

/** Verhindert Login-Umleitungen offline — Safari/WebKit bricht bei SW-Redirects ab. */
export default function OfflineSessionGuard() {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (navigator.onLine) return;
    if (!hasOfflineSessionHint()) return;

    if (pathname === "/login" || pathname.startsWith("/auth/")) {
      router.replace("/dashboard");
    }
  }, [pathname, router]);

  return null;
}
