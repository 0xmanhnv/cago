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
    await updateSale(sale.client_uuid, { status: "done", invoice: r.invoice, error: undefined });
  } catch (e) {
    if (e instanceof FrappeError) {
      // The server received it and rejected on business rules — won't fix itself on retry.
      await updateSale(sale.client_uuid, { status: "failed", error: e.message });
    } else {
      // Network/transport failure — keep it pending and try again on the next flush.
      await updateSale(sale.client_uuid, { status: "pending" });
      throw e; // stop the run; the connection is gone
    }
  }
}

/** Send every pending sale, FIFO. Returns how many synced. Re-entrant-safe (single flush at a time). */
export async function flushQueue(): Promise<number> {
  if (_flushing) return 0;
  _flushing = true;
  let synced = 0;
  try {
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
  } finally {
    _flushing = false;
    if (synced) announce();
  }
  return synced;
}
