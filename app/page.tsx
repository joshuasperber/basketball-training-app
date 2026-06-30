"use client";

import { useEffect } from "react";
import { redirectToRecoveryPageIfHashPresent } from "@/lib/auth-recovery-client";

export default function HomePage() {
  useEffect(() => {
    if (redirectToRecoveryPageIfHashPresent()) return;
    window.location.replace("/dashboard");
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <p className="text-sm text-muted">Weiterleitung …</p>
    </main>
  );
}
