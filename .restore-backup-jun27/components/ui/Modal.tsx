"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children: ReactNode;
  panelClassName?: string;
};

export default function Modal({ open, onClose, title, children, panelClassName = "" }: ModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="modal-overlay" role="presentation">
      {onClose ? (
        <button type="button" className="modal-backdrop" aria-label="Schließen" onClick={onClose} />
      ) : (
        <div className="modal-backdrop" aria-hidden />
      )}
      <section
        className={`modal-panel ${panelClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        {title ? (
          <header className="modal-panel__header">
            <h3 id="modal-title" className="section-title">
              {title}
            </h3>
          </header>
        ) : null}
        <div className="modal-panel__body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
