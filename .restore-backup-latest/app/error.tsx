"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="app-container flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="page-title">Etwas ist schiefgelaufen</h1>
      <p className="page-subtitle mt-2 max-w-md">
        Der Fehler wurde protokolliert. Du kannst es erneut versuchen oder zum Dashboard zurückkehren.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-faint">Referenz: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Erneut versuchen
        </button>
        <Link href="/dashboard" className="btn btn-ghost">
          Zum Dashboard
        </Link>
      </div>
    </main>
  );
}
