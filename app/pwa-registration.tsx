"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA registration is an enhancement; the dashboard remains usable if it fails.
      });
    }
  }, []);

  return null;
}
