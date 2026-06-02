// Catalog + customer cache for offline selling. When online we periodically snapshot the whole
// sellable catalog and customer list into IndexedDB; when offline the sell screen reads/searches
// those caches instead of hitting the server.

import { frappeCall } from "@/lib/api";
import { type CatalogRow, type CustomerRow, db, metaGet, metaSet } from "./db";

const FRESH_MS = 10 * 60 * 1000; // re-snapshot at most every 10 min while online
const LAST_SYNC = "catalogSyncedAt";

/** Pull the full catalog + customers and store them. Throttled unless `force`. Safe to call often. */
export async function refreshCatalog(force = false): Promise<void> {
  const last = (await metaGet<number>(LAST_SYNC)) || 0;
  if (!force && Date.now() - last < FRESH_MS) return;
  const [catalog, customers] = await Promise.all([
    frappeCall<CatalogRow[]>("cago.api.staff.catalog_snapshot", {}, { method: "GET" }),
    frappeCall<CustomerRow[]>("cago.api.sales.customers_snapshot", {}, { method: "GET" }),
  ]);
  const d = await db();
  {
    const tx = d.transaction("catalog", "readwrite");
    await tx.store.clear();
    for (const row of catalog || []) await tx.store.put(row);
    await tx.done;
  }
  {
    const tx = d.transaction("customers", "readwrite");
    await tx.store.clear();
    for (const row of customers || []) await tx.store.put(row);
    await tx.done;
  }
  await metaSet(LAST_SYNC, Date.now());
}

export async function catalogCount(): Promise<number> {
  try {
    return await (await db()).count("catalog");
  } catch {
    return 0;
  }
}

function matches(row: CatalogRow, q: string): boolean {
  if (!q) return true;
  const hay = `${row.display_name} ${row.item_code} ${row.category || ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((tok) => hay.includes(tok));
}

/** Offline equivalent of cago.api.staff.search_products (client-side filter + paginate). */
export async function searchCatalogLocal(
  query: string,
  category: string | null,
  start = 0,
  pageSize = 30,
): Promise<CatalogRow[]> {
  const all = await (await db()).getAll("catalog");
  const q = (query || "").trim();
  const filtered = all
    .filter((r) => (category ? r.category === category : true))
    .filter((r) => matches(r, q))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "vi"));
  return filtered.slice(start, start + pageSize);
}

/** Offline equivalent of cago.api.staff.get_product — the cached row IS the meta the cart needs. */
export async function getProductLocal(itemCode: string): Promise<CatalogRow | undefined> {
  try {
    return await (await db()).get("catalog", itemCode);
  } catch {
    return undefined;
  }
}

/** Offline equivalent of cago.api.catalog.find_by_barcode. */
export async function findByBarcodeLocal(barcode: string): Promise<string | null> {
  const code = (barcode || "").trim();
  if (!code) return null;
  const all = await (await db()).getAll("catalog");
  const hit = all.find((r) => (r.barcodes || []).includes(code));
  return hit ? hit.item_code : null;
}

/** Offline equivalent of cago.api.sales.search_customers_lite. */
export async function searchCustomersLocal(query: string, start = 0, pageSize = 20): Promise<CustomerRow[]> {
  const all = await (await db()).getAll("customers");
  const q = (query || "").trim().toLowerCase();
  const filtered = q
    ? all.filter((c) => `${c.customer_name} ${c.mobile || ""}`.toLowerCase().includes(q))
    : all;
  return filtered.slice(start, start + pageSize);
}
