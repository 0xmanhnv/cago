"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CapabilityGuard } from "@/components/CapabilityGuard";
import { useSession } from "@/lib/session";
import { isInternal, type Cap } from "@/lib/caps";
import { isFixedKiosk } from "@/components/kiosk/StoreMapView";
import { hasPosPin, isPosLocked } from "@/lib/posLock";
import { usePosKioskAutoLock } from "@/lib/usePosKioskLogout";
import { PinLock } from "./PinLock";

// Which capability the current /pos route needs. Central so we don't sprinkle guards across ~28
// pages. Most-specific paths first. Routes that are shared lookups (home, search, orders,
// assistant, a product detail view) need only "any internal" → no cap.
function capFor(path: string): { cap?: Cap; owner?: boolean } {
  if (path.startsWith("/pos/staff") || path.startsWith("/pos/ai-settings")) return { owner: true }; // owner-only
  if (path.startsWith("/pos/products/") && path.endsWith("/edit")) return { cap: "products" };
  if (
    path.startsWith("/pos/products/new") ||
    path.startsWith("/pos/price") ||
    path.startsWith("/pos/edit") ||
    path.startsWith("/pos/categories")
  )
    return { cap: "products" };
  if (path.startsWith("/pos/products/")) return {}; // detail view = any internal
  if (path.startsWith("/pos/sell")) return { cap: "sell" };
  if (path.startsWith("/pos/returns")) return { cap: "returns" };
  if (path.startsWith("/pos/record-payment") || path.startsWith("/pos/record-debt")) return { cap: "debt" }; // write
  if (path.startsWith("/pos/verify") || path.startsWith("/pos/debt")) return { cap: "debt_view" }; // read
  if (path.startsWith("/pos/exchange")) return { cap: "returns" };
  if (
    path.startsWith("/pos/receive") ||
    path.startsWith("/pos/bulk") ||
    path.startsWith("/pos/alerts") ||
    path.startsWith("/pos/reorder") ||
    path.startsWith("/pos/low-stock") ||
    path.startsWith("/pos/expiry")
  )
    return { cap: "stock" };
  if (path.startsWith("/pos/labels")) return { cap: "products" };
  if (path.startsWith("/pos/supplier-debt")) return { cap: "supplier" };
  if (path.startsWith("/pos/cashbook")) return { cap: "cash" };
  if (path.startsWith("/pos/reports") || path.startsWith("/pos/unsafe")) return { cap: "reports" };
  if (path.startsWith("/pos/coupons") || path.startsWith("/pos/settings") || path.startsWith("/pos/map")) return { cap: "settings" };
  return {}; // /pos home, /pos/search, /pos/orders, /pos/assistant
}

export function PosShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "";
  const { cap, owner } = capFor(path);
  const { boot } = useSession();
  const signedIn = isInternal(boot);
  // Shared kiosk device only: gate the POS behind a quick PIN (full login kept). `locked` is
  // client-only (reads localStorage), so it starts false on the server → hydration-safe.
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    setLocked(isFixedKiosk() && hasPosPin() && isPosLocked());
  }, [path]);
  usePosKioskAutoLock(signedIn, useCallback(() => setLocked(true), []));

  // Record that the user has navigated within the app this session, so BackBar's smart-back knows
  // there's real in-app history to step back through (vs a cold/refresh load → fall back to home).
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (prev.current !== null && prev.current !== path) {
      try { sessionStorage.setItem("cago_nav", "1"); } catch { /* ignore */ }
    }
    prev.current = path;
  }, [path]);

  if (signedIn && locked) return <PinLock brand={boot?.brand} onUnlock={() => setLocked(false)} />;
  return (
    <CapabilityGuard cap={cap} owner={owner}>
      {/* Ease each route in (keyed by path) so navigating never "snaps" — it cross-fades. */}
      <div key={path} className="animate-fade-in">
        {children}
      </div>
    </CapabilityGuard>
  );
}
