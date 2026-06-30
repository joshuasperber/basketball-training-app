"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
};

export default function Sheet({ open, onClose, title, description, children }: SheetProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="sheet-root" role="presentation">
      <button type="button" className="sheet-backdrop" aria-label="Schließen" onClick={onClose} />
      <div className="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header className="sheet-header">
          <div className="min-w-0 flex-1">
            <h2 id="sheet-title" className="sheet-title">
              {title}
            </h2>
            {description ? <p className="sheet-description">{description}</p> : null}
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Schließen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
