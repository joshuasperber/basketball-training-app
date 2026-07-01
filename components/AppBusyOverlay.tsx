"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type AppBusyOverlayProps = {
  open: boolean;
  label?: string;
  sublabel?: string;
};

/** Vollbild-Ladeoverlay — hell, modern, basketball-themed. */
export default function AppBusyOverlay({
  open,
  label = "Bitte warten …",
  sublabel,
}: AppBusyOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="app-busy-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="app-busy-card">
        <div className="app-busy-ball-ring" aria-hidden>
          <span className="app-busy-ball">🏀</span>
        </div>
        <p className="app-busy-label">{label}</p>
        {sublabel ? <p className="app-busy-sublabel">{sublabel}</p> : null}
      </div>
    </div>,
    document.body,
  );
}
