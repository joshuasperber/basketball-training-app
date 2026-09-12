"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

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
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backgroundElements = Array.from(
      document.querySelectorAll<HTMLElement>(".app-shell, .bottom-nav, footer"),
    );
    backgroundElements.forEach((element) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    overlayRef.current?.focus();
    return () => {
      backgroundElements.forEach((element) => {
        element.inert = false;
        element.removeAttribute("aria-hidden");
      });
      previousFocus?.focus();
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="app-busy-overlay"
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      aria-busy="true"
      aria-labelledby="app-busy-label"
      tabIndex={-1}
    >
      <div className="app-busy-card">
        <div className="app-busy-ball-ring" aria-hidden>
          <span className="app-busy-ball">🏀</span>
        </div>
        <p id="app-busy-label" className="app-busy-label">{label}</p>
        {sublabel ? <p className="app-busy-sublabel">{sublabel}</p> : null}
      </div>
    </div>,
    document.body,
  );
}
