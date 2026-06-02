// Network state for the sell screen. navigator.onLine alone lies on "connected to wifi but the
// wifi has no internet" (common in rural shops), so we also poll a cheap guest endpoint to confirm
// the server is actually reachable. Emits `cago:online` / `cago:offline` window events so the sync
// engine can react without prop-drilling.
"use client";

import { useEffect, useState } from "react";

let _online = typeof navigator === "undefined" ? true : navigator.onLine;
let _polling = false;

export function isOnlineNow(): boolean {
  return _online;
}

function setOnline(next: boolean) {
  if (next === _online) return;
  _online = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(next ? "cago:online" : "cago:offline"));
  }
}

// A HEAD-ish ping that costs almost nothing. bootstrap is allow_guest so it never 401s.
async function probe(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch("/api/method/cago.api.session.bootstrap", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

function startPolling() {
  if (_polling || typeof window === "undefined") return;
  _polling = true;
  const onUp = () => probe().then(setOnline);
  const onDown = () => setOnline(false);
  window.addEventListener("online", onUp);
  window.addEventListener("offline", onDown);
  // Periodic re-check (every 20s) catches the "wifi up, internet down" case in both directions.
  window.setInterval(() => {
    if (navigator.onLine) void probe().then(setOnline);
    else setOnline(false);
  }, 20000);
}

export function useOnline(): boolean {
  const [online, setLocal] = useState(_online);
  useEffect(() => {
    startPolling();
    const sync = () => setLocal(_online);
    window.addEventListener("cago:online", sync);
    window.addEventListener("cago:offline", sync);
    // Confirm on mount (the cached _online may be stale after a tab was backgrounded).
    void probe().then(setOnline);
    return () => {
      window.removeEventListener("cago:online", sync);
      window.removeEventListener("cago:offline", sync);
    };
  }, []);
  return online;
}
