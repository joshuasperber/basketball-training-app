"use client";

import { useSyncExternalStore } from "react";

/** True only after the component mounted on the client — safe gate for localStorage reads. */
export function useClientMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
