"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type ViewportToastProps = {
  message: string | null;
  className?: string;
  role?: "status" | "alert";
};

/** Toast am oberen Bildschirmrand (Portal), unabhängig von transform auf Page-Containern. */
export default function ViewportToast({ message, className = "", role = "status" }: ViewportToastProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !message) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
      role={role}
      aria-live="polite"
    >
      <p className={`pointer-events-auto max-w-md rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] px-4 py-3 text-center text-sm font-semibold text-strong shadow-[var(--shadow-card)] backdrop-blur-md ${className}`}>
        {message}
      </p>
    </div>,
    document.body,
  );
}
