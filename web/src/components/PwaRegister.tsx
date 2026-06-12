"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Whether a SW already controls this page. On the very first install clients.claim() also fires
    // controllerchange — we must NOT reload then (no stale bundle to escape), only on a later update.
    const hadController = !!navigator.serviceWorker.controller;
    let reg: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        reg = r;
      })
      .catch(() => {});
    // A long-lived PWA session (kiosk tablet left open for days) would otherwise keep running an old
    // JS bundle until a navigation happens. Poll for a new SW hourly + when the tab refocuses, and
    // reload once a NEW worker takes over so a deploy reliably reaches the device.
    const check = () => reg?.update().catch(() => {});
    const t = window.setInterval(check, 60 * 60 * 1000);
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    let reloaded = false;
    const onCtrl = () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onCtrl);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      navigator.serviceWorker.removeEventListener("controllerchange", onCtrl);
    };
  }, []);
  return null;
}
