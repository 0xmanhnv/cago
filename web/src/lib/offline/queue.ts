// The offline sale queue. A sale rung up without a network is stored here with a client_uuid
// (idempotency key) and a provisional local code, then flushed by sync.ts when the server returns.

import { type QueuedSale, type SaleArgs, type SaleDisplay, db } from "./db";

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Fallback (older webviews): timestamp + random is plenty unique for a single till.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/** "TẠM-AB12CD" — short, human-readable, derived from the uuid so it's stable for reprints. */
function localCodeFrom(id: string): string {
  return `TẠM-${id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`;
}

function nowStamp(): string {
  // "YYYY-MM-DD HH:mm:ss" in local time — what quick_sale(posted_at=...) expects.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function enqueueSale(args: SaleArgs, display: SaleDisplay): Promise<QueuedSale> {
  const id = uuid();
  const sale: QueuedSale = {
    client_uuid: id,
    local_code: localCodeFrom(id),
    posted_at: nowStamp(),
    created_at: Date.now(),
    status: "pending",
    args,
    display,
  };
  await (await db()).put("queue", sale);
  // Let the header badge / pending screen update right away (sync.ts fires the same event on flush).
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cago:queuechange"));
  return sale;
}

export async function listQueue(): Promise<QueuedSale[]> {
  try {
    const all = await (await db()).getAll("queue");
    return all.sort((a, b) => a.created_at - b.created_at);
  } catch {
    return [];
  }
}

/** Counts for the header badge: how many still need syncing vs. stuck. */
export async function queueCounts(): Promise<{ pending: number; failed: number }> {
  const all = await listQueue();
  return {
    pending: all.filter((s) => s.status === "pending" || s.status === "syncing").length,
    failed: all.filter((s) => s.status === "failed").length,
  };
}

export async function updateSale(id: string, patch: Partial<QueuedSale>): Promise<void> {
  const d = await db();
  const cur = await d.get("queue", id);
  if (!cur) return;
  await d.put("queue", { ...cur, ...patch });
}

/** Drop synced sales so the queue doesn't grow forever (keep failed ones for owner attention). */
export async function purgeDone(): Promise<void> {
  const d = await db();
  const tx = d.transaction("queue", "readwrite");
  for (const s of await tx.store.getAll()) {
    if (s.status === "done") await tx.store.delete(s.client_uuid);
  }
  await tx.done;
}

export async function retrySale(id: string): Promise<void> {
  await updateSale(id, { status: "pending", error: undefined });
}
