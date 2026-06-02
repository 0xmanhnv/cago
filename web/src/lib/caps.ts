// Capability model for the unified /pos app. Access is granular: the backend grants a user one
// or more capability roles and returns the matching keys in boot.caps (owner = all). The UI shows
// only the tiles a user may use; every API still re-checks server-side (see utils/permissions.py).
import type { Bootstrap } from "./types";

export type Cap = "sell" | "returns" | "debt" | "stock" | "products" | "reports" | "cash" | "supplier" | "settings";

export const CAP_LABELS: Record<Cap, string> = {
  sell: "Bán hàng",
  returns: "Trả hàng",
  debt: "Công nợ khách",
  stock: "Nhập hàng & kho",
  products: "Sản phẩm & giá",
  reports: "Báo cáo",
  cash: "Sổ quỹ / chốt ca",
  supplier: "Công nợ NCC",
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

// Owner = holds every capability (super-role). Used to gate owner-only screens (e.g. staff admin).
export function isOwner(boot: Bootstrap | null): boolean {
  return !!boot && ALL_CAPS.every((c) => boot.caps?.includes(c));
}
