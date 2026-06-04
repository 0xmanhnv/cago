// Capability model for the unified /pos app. Access is granular: the backend grants a user one
// or more capability roles and returns the matching keys in boot.caps (owner = all). The UI shows
// only the tiles a user may use; every API still re-checks server-side (see utils/permissions.py).
import type { Bootstrap } from "./types";

export type Cap = "sell" | "returns" | "debt_view" | "debt" | "stock" | "products" | "reports" | "cash" | "supplier" | "settings";

export const CAP_LABELS: Record<Cap, string> = {
  sell: "Bán hàng",
  returns: "Trả hàng",
  debt_view: "Xem công nợ",
  debt: "Thu / Ghi nợ",
  stock: "Nhập hàng & kho",
  products: "Sản phẩm & giá",
  reports: "Báo cáo",
  cash: "Sổ quỹ / chốt ca",
  supplier: "Nhà cung cấp",
  settings: "Cài đặt cửa hàng",
};

export const ALL_CAPS = Object.keys(CAP_LABELS) as Cap[];

export function hasCap(boot: Bootstrap | null, cap: Cap): boolean {
  return !!boot && Array.isArray(boot.caps) && boot.caps.includes(cap);
}

// Any back-of-house user (holds at least one capability) — gate for the whole /pos shell.
export function isInternal(boot: Bootstrap | null): boolean {
  return !!boot && Array.isArray(boot.caps) && boot.caps.length > 0;
}

// Owner = holds the owner ROLE (matches the server's is_owner). NOT "has all caps" — a staffer
// granted every capability is still not the owner (can't manage staff / open the Desk).
// An Admin is also an Owner (superset), so admins operate the shop normally + the technical bits.
export function isOwner(boot: Bootstrap | null): boolean {
  if (boot?.is_owner !== undefined) return !!boot.is_owner;
  return !!boot && Array.isArray(boot.roles) && boot.roles.some((r) => r === "Cago Owner" || r === "Cago Admin" || r === "System Manager");
}

// Admin = technical/installer tier. Gates technical-config screens (LLM keys, messaging webhook,
// backup) so a non-technical owner never sees them. System Manager qualifies too.
export function isAdmin(boot: Bootstrap | null): boolean {
  if (boot?.is_admin !== undefined) return !!boot.is_admin;
  return !!boot && Array.isArray(boot.roles) && boot.roles.some((r) => r === "Cago Admin" || r === "System Manager");
}
