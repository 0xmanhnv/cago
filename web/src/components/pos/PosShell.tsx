"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CapabilityGuard } from "@/components/CapabilityGuard";
import { FloatingFab } from "@/components/kiosk/FloatingFab";
import { frappeCall } from "@/lib/api";
import { useSession } from "@/lib/session";
import { isInternal, hasCap, type Cap } from "@/lib/caps";
import { usePosKioskAutoLock } from "@/lib/usePosKioskLogout";
import { PinLock } from "./PinLock";

// Which capability the current /pos route needs. Central so we don't sprinkle guards across ~28
// pages. Most-specific paths first. Routes that are shared lookups (home, search, orders,
// assistant, a product detail view) need only "any internal" → no cap.
function capFor(path: string): { cap?: Cap; owner?: boolean; admin?: boolean } {
  // Technical tier (LLM keys / messaging webhook / backup) — hidden from a non-technical owner.
  if (path.startsWith("/pos/ai-settings") || path.startsWith("/pos/backup")) return { admin: true };
  if (path.startsWith("/pos/staff") || path.startsWith("/pos/readiness")) return { owner: true }; // owner-only
  if (path.startsWith("/pos/products/") && path.endsWith("/edit")) return { cap: "products" };
  if (
    path.startsWith("/pos/products/new") ||
    path.startsWith("/pos/price") ||
    path.startsWith("/pos/edit") ||
    path.startsWith("/pos/categories")
  )
    return { cap: "products" };
  if (path.startsWith("/pos/products/")) return {}; // detail view = any internal
  if (path.startsWith("/pos/sell") || path.startsWith("/pos/support")) return { cap: "sell" };
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
  if (path.startsWith("/pos/suppliers")) return { cap: "supplier" };
  if (path.startsWith("/pos/cashbook")) return { cap: "cash" };
  if (path.startsWith("/pos/reports") || path.startsWith("/pos/unsafe") || path.startsWith("/pos/assistant-insights") || path.startsWith("/pos/assistant-content")) return { cap: "reports" };
  if (path.startsWith("/pos/coupons") || path.startsWith("/pos/settings") || path.startsWith("/pos/map")) return { cap: "settings" };
  return {}; // /pos home, /pos/search, /pos/orders, /pos/assistant
}

export function PosShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "";
  const { cap, owner, admin } = capFor(path);
  const { boot, reload } = useSession();
  const signedIn = isInternal(boot);
  // The PIN lock state is authoritative from the SERVER session (boot.pos_locked) — not localStorage
  // — so editing the URL / reloading / clearing storage can't bypass it, and there's no first-render
  // flash (boot is already awaited before children render).
  const locked = signedIn && !!boot?.pos_locked;
  // Idle on a shared kiosk device → lock server-side, then refresh the bootstrap so the gate shows.
  // Only arm when a shop PIN exists — never auto-lock into a PIN screen nothing can open.
  usePosKioskAutoLock(signedIn && !!boot?.has_pos_pin, reload);

  // Record that the user has navigated within the app this session, so BackBar's smart-back knows
  // there's real in-app history to step back through (vs a cold/refresh load → fall back to home).
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (prev.current !== null && prev.current !== path) {
      try { sessionStorage.setItem("cago_nav", "1"); } catch { /* ignore */ }
    }
    prev.current = path;
  }, [path]);

  if (locked) return <PinLock brand={boot?.brand} onUnlock={reload} />;
  return (
    <CapabilityGuard cap={cap} owner={owner} admin={admin}>
      {/* Ease each route in (keyed by path) so navigating never "snaps" — it cross-fades. */}
      <div key={path} className="animate-fade-in">
        {children}
      </div>
      {/* Live "khách cần hỗ trợ" badge — visible anywhere in /pos (except the queue itself) to anyone
          who can sell, so staff see a call no matter which screen they're on. */}
      {signedIn && hasCap(boot, "sell") && !path.startsWith("/pos/support") && <SupportBadge />}
    </CapabilityGuard>
  );
}

function SupportBadge() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const n = await frappeCall<number>("cago.api.support.pending_count", {});
        if (alive) setCount(Number(n) || 0);
      } catch {
        /* ignore — retry next tick */
      }
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (!count) return null;
  // Draggable like the kiosk FABs (snaps to an edge, position remembered) so it never permanently
  // covers a tile — the staff member can park it wherever suits the counter.
  return (
    <FloatingFab
      storageKey="cago_fab_support"
      onTap={() => router.push("/pos/support")}
      title="Khách cần hỗ trợ"
      style={{ position: "fixed", right: 12, bottom: 84, zIndex: 55 }}
      className="animate-pop-in flex items-center gap-2 rounded-full bg-red-600 px-5 py-3.5 text-base font-extrabold text-white shadow-2xl"
    >
      🛎️ {count} khách cần hỗ trợ
    </FloatingFab>
  );
}
