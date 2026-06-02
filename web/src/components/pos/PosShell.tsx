"use client";

import { usePathname } from "next/navigation";
import { CapabilityGuard } from "@/components/CapabilityGuard";
import type { Cap } from "@/lib/caps";

// Which capability the current /pos route needs. Central so we don't sprinkle guards across ~28
// pages. Most-specific paths first. Routes that are shared lookups (home, search, orders,
// assistant, a product detail view) need only "any internal" → no cap.
function capFor(path: string): { cap?: Cap; owner?: boolean } {
  if (path.startsWith("/pos/staff")) return { owner: true }; // managing employees = owner-only
  if (path.startsWith("/pos/products/") && path.endsWith("/edit")) return { cap: "products" };
  if (
    path.startsWith("/pos/products/new") ||
    path.startsWith("/pos/price") ||
    path.startsWith("/pos/edit") ||
    path.startsWith("/pos/categories")
  )
    return { cap: "products" };
  if (path.startsWith("/pos/products/")) return {}; // detail view = any internal
  if (path.startsWith("/pos/sell") || path.startsWith("/pos/credit-sale")) return { cap: "sell" };
  if (path.startsWith("/pos/returns")) return { cap: "returns" };
  if (path.startsWith("/pos/record-payment") || path.startsWith("/pos/record-debt")) return { cap: "debt" }; // write
  if (path.startsWith("/pos/verify") || path.startsWith("/pos/debt")) return { cap: "debt_view" }; // read
  if (
    path.startsWith("/pos/receive") ||
    path.startsWith("/pos/bulk") ||
    path.startsWith("/pos/low-stock") ||
    path.startsWith("/pos/expiry")
  )
    return { cap: "stock" };
  if (path.startsWith("/pos/supplier-debt")) return { cap: "supplier" };
  if (path.startsWith("/pos/cashbook")) return { cap: "cash" };
  if (path.startsWith("/pos/reports")) return { cap: "reports" };
  if (path.startsWith("/pos/coupons") || path.startsWith("/pos/settings") || path.startsWith("/pos/map")) return { cap: "settings" };
  return {}; // /pos home, /pos/search, /pos/orders, /pos/assistant
}

export function PosShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "";
  const { cap, owner } = capFor(path);
  return (
    <CapabilityGuard cap={cap} owner={owner}>
      {children}
    </CapabilityGuard>
  );
}
