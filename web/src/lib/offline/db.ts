// Offline storage for the staff sell screen — a small IndexedDB (via `idb`) holding a snapshot of
// the catalog + customers (so search/cart work with no network) and a queue of sales rung up while
// offline (flushed to the server when the connection returns). Cash + credit only offline; bank/QR
// need the network. See docs/offline-sell.

import { type DBSchema, type IDBPDatabase, openDB } from "idb";

// One sellable product, cached for offline search + add-to-cart. Superset of ProductCard + the
// per-product Meta the cart needs (sale_units / stock). Mirrors cago.api.staff.catalog_snapshot.
export interface CatalogRow {
  item_code: string;
  display_name: string;
  image?: string | null;
  category?: string;
  category_parent?: string | null; // loại cha — so the offline parent-category filter aggregates children
  category_icon?: string;
  category_color?: string;
  price_text: string;
  selling_price?: number;
  unit?: string;
  stock_status?: string | null;
  stock_auto?: boolean;
  actual_stock_qty?: number | null;
  is_chemical?: boolean;
  shelf_location?: string | null;
  safety_notes?: string | null;
  sale_units?: { uom: string; label?: string; price_text: string }[];
  barcodes?: string[];
}

export interface CustomerRow {
  customer: string;
  customer_name: string;
  village?: string | null;
  mobile?: string | null;
  points?: number;
  outstanding_text?: string | null;
}

// The exact payload quick_sale expects (sans the offline-only client_uuid/posted_at, added on send).
export interface SaleArgs {
  items: { item_code: string; qty: number; uom: string; rate?: number }[];
  payment_mode?: "cash" | "bank" | "credit" | "split";
  customer?: string | null;
  discount_amount?: number;
  coupon?: string;
  redeem_points?: number;
  delivery_charge?: number;
  payments?: { mode: "cash" | "bank"; amount: number }[];
}

// What the pending list shows + reprints, captured at ring-up so it needs no server.
export interface SaleDisplay {
  customer_name?: string;
  total_text: string;
  item_count: number;
  payment_mode: "cash" | "bank" | "credit" | "split";
  lines: { name: string; qty: number; uom: string; rate_text: string; amount_text: string }[];
}

export type QueueStatus = "pending" | "syncing" | "done" | "failed";

export interface QueuedSale {
  client_uuid: string; // idempotency key — server dedups on it
  local_code: string; // human-facing provisional number (TẠM-xxxx)
  posted_at: string; // "YYYY-MM-DD HH:mm:ss" when it was rung up
  created_at: number; // epoch ms, for FIFO ordering
  status: QueueStatus;
  args: SaleArgs;
  display: SaleDisplay;
  invoice?: string; // real Sales Invoice once synced
  error?: string; // business error if it can't sync (needs owner attention)
}

interface CagoDB extends DBSchema {
  catalog: { key: string; value: CatalogRow };
  customers: { key: string; value: CustomerRow };
  queue: { key: string; value: QueuedSale };
  meta: { key: string; value: { key: string; value: unknown } };
}

const DB_NAME = "cago-offline";
const DB_VERSION = 1;

let _db: Promise<IDBPDatabase<CagoDB>> | null = null;

export function db(): Promise<IDBPDatabase<CagoDB>> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.reject(new Error("IndexedDB không khả dụng"));
  }
  if (!_db) {
    _db = openDB<CagoDB>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains("catalog")) d.createObjectStore("catalog", { keyPath: "item_code" });
        if (!d.objectStoreNames.contains("customers")) d.createObjectStore("customers", { keyPath: "customer" });
        if (!d.objectStoreNames.contains("queue")) d.createObjectStore("queue", { keyPath: "client_uuid" });
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "key" });
      },
    });
  }
  return _db;
}

export async function metaGet<T = unknown>(key: string): Promise<T | undefined> {
  try {
    const row = await (await db()).get("meta", key);
    return row?.value as T | undefined;
  } catch {
    return undefined;
  }
}

export async function metaSet(key: string, value: unknown): Promise<void> {
  try {
    await (await db()).put("meta", { key, value });
  } catch {
    /* storage may be unavailable (private mode) — offline simply won't persist */
  }
}
