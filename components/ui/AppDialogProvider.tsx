"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Modal from "@/components/ui/Modal";

export type ConfirmDialogOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

export type AlertDialogOptions = {
  title?: string;
  message: string;
  okLabel?: string;
};

type DialogContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  alert: (options: AlertDialogOptions) => Promise<void>;
};

const AppDialogContext = createContext<DialogContextValue | null>(null);

type ActiveConfirm = ConfirmDialogOptions & { open: true };
type ActiveAlert = AlertDialogOptions & { open: true };

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<ActiveConfirm | null>(null);
  const [alertState, setAlertState] = useState<ActiveAlert | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const alertResolverRef = useRef<(() => void) | null>(null);

  const closeConfirm = useCallback((value: boolean) => {
    confirmResolverRef.current?.(value);
    confirmResolverRef.current = null;
    setConfirmState(null);
  }, []);

  const closeAlert = useCallback(() => {
    alertResolverRef.current?.();
    alertResolverRef.current = null;
    setAlertState(null);
  }, []);

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({ ...options, open: true });
    });
  }, []);

  const alert = useCallback((options: AlertDialogOptions) => {
    return new Promise<void>((resolve) => {
      alertResolverRef.current = resolve;
      setAlertState({ ...options, open: true });
    });
  }, []);

  const value = useMemo(() => ({ confirm, alert }), [alert, confirm]);

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <Modal
        open={Boolean(confirmState)}
        onClose={() => closeConfirm(false)}
        panelClassName="modal-panel--confirm"
      >
        {confirmState ? (
          <div className="app-dialog">
            {confirmState.title ? <p className="app-dialog__title">{confirmState.title}</p> : null}
            <p className="app-dialog__message">{confirmState.message}</p>
            <div className="app-dialog__actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => closeConfirm(false)}>
                {confirmState.cancelLabel ?? "Abbrechen"}
              </button>
              <button
                type="button"
                className={confirmState.tone === "danger" ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"}
                onClick={() => closeConfirm(true)}
              >
                {confirmState.confirmLabel ?? "OK"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal open={Boolean(alertState)} onClose={closeAlert} panelClassName="modal-panel--confirm">
        {alertState ? (
          <div className="app-dialog">
            {alertState.title ? <p className="app-dialog__title">{alertState.title}</p> : null}
            <p className="app-dialog__message">{alertState.message}</p>
            <div className="app-dialog__actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={closeAlert}>
                {alertState.okLabel ?? "OK"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) {
    throw new Error("useAppDialog must be used within AppDialogProvider");
  }
  return context;
}
