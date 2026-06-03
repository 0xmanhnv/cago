// Flushes the offline sale queue to the server. Network errors keep a sale `pending` (retry next
// time); business errors (item deleted, debt over limit) mark it `failed` for the owner to fix by
// hand — never silently dropped. The server dedups on client_uuid, so a re-sent sale that actually
// succeeded the first time resolves to the same invoice.

import { FrappeError, frappeCall } from "@/lib/api";
import { type QueuedSale } from "./db";
import { listQueue, updateSale } from "./queue";

interface SaleResult {
  invoice: string;
  total_text: string;
  duplicate?: boolean;
  cancelled?: boolean; // the dedup resolved to an invoice the owner had cancelled (voided sale)
}

let _flushing = false;

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cago:queuechange"));
}

async function send(sale: QueuedSale): Promise<void> {
  await updateSale(sale.client_uuid, { status: "syncing" });
  try {
    const r = await frappeCall<SaleResult>("cago.api.sales.quick_sale", {
      ...sale.args,
      client_uuid: sale.client_uuid,
      posted_at: sale.posted_at,
    });
    if (r.cancelled) {
      // The matching invoice was voided server-side — this sale was NOT booked. Surface it so the
      // owner re-rings it, rather than showing a green "done" against a cancelled invoice.
      await updateSale(sale.client_uuid, { status: "failed", error: "Hoá đơn đã bị huỷ trên hệ thống — cần bán lại đơn này." });
      return;
    }
    await updateSale(sale.client_uuid, { status: "done", invoice: r.invoice, error: undefined });
  } catch (e) {
    // A 5xx / 429 means the server is briefly unavailable (e.g. restarting after a deploy) — the
    // sale isn't rejected, it just didn't land. Keep it pending and retry; only a 4xx is a real
    // business rejection (item deleted, debt over limit) that won't fix itself.
    const transient = e instanceof FrappeError && (e.status >= 500 || e.status === 429);
    if (e instanceof FrappeError && !transient) {
      await updateSale(sale.client_uuid, { status: "failed", error: e.message });
    } else {
      await updateSale(sale.client_uuid, { status: "pending" });
      throw e; // stop the run; the connection/server is gone
    }
  }
}

async function drain(): Promise<number> {
  let synced = 0;
  const pending = (await listQueue()).filter((s) => s.status === "pending" || s.status === "syncing");
  for (const sale of pending) {
    try {
      await send(sale);
      synced += 1;
      announce();
    } catch {
      break; // network dropped mid-flush; leave the rest pending
    }
  }
  return synced;
}

/**
 * Send every pending sale, FIFO. Returns how many synced. Serialised so the same uuid is never sent
 * twice in parallel: a module guard for same-context re-entrancy, and a cross-tab Web Lock so two
 * open tablets/tabs don't both flush the same queue (which would race the server's uuid dedup).
 */
export async function flushQueue(): Promise<number> {
  if (_flushing) return 0;
  _flushing = true;
  try {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks) {
      // ifAvailable: if another tab holds the lock it's already flushing — skip rather than queue.
      return (await locks.request("cago-flush-queue", { ifAvailable: true }, async (lock) => (lock ? drain() : 0))) ?? 0;
    }
    return await drain();
  } finally {
    _flushing = false;
  }
}
