"use client";

import { useEffect, useState } from "react";

/** True only after the component mounted on the client — safe gate for localStorage reads. */
export function useClientMounted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
