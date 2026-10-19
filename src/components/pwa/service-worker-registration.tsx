"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let checkForUpdate: (() => void) | undefined;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then((value) => {
        if (!active) return;
        registration = value;
        checkForUpdate = () => {
          if (document.visibilityState === "visible") void registration?.update().catch(() => undefined);
        };
        document.addEventListener("visibilitychange", checkForUpdate);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      if (checkForUpdate) document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);

  return null;
}
