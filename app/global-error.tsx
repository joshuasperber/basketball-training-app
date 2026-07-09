"use client";

import { useEffect } from "react";
import { captureExceptionIfConsented } from "@/lib/sentry-client-init";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureExceptionIfConsented(error);
  }, [error]);

  return (
    <html lang="de">
      <body className="min-h-dvh bg-zinc-950 px-4 py-12 text-zinc-100">
        <h1 className="text-xl font-bold">Unerwarteter Fehler</h1>
        <p className="mt-2 text-sm text-zinc-400">Der Fehler wurde protokolliert (falls Sentry konfiguriert ist).</p>
        <button
          type="button"
          className="mt-6 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => reset()}
        >
          Neu laden
        </button>
      </body>
    </html>
  );
}
