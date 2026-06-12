// Flushes the offline sale queue to the server. Network errors keep a sale `pending` (retry next
// time); business errors (item deleted, debt over limit) mark it `failed` for the owner to fix by
// hand — never silently dropped. The server dedups on client_uuid, so a re-sent sale that actually
// succeeded the first time resolves to the same invoice.

import { FrappeError, frappeCall, setCsrfToken } from "@/lib/api";
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

// Status codes that mean "couldn't deliver yet", NOT "the shop rejected this sale": server briefly
// down (5xx), throttled (429), or a stale CSRF token (400). These keep the sale PENDING and stop the
// run. NOTE: 401/403 are deliberately NOT transient — a genuinely expired/guest session would loop
// forever as pending (the queue never promotes pending→failed), silently hiding un-bookable sales
// from the owner's `failed` count. An auth rejection must fail the sale so it surfaces for re-entry;
// refreshSession() below already tops up a still-valid session's CSRF before we get here.
function isTransient(e: unknown): boolean {
  return e instanceof FrappeError && (e.status >= 500 || e.status === 429 || e.status === 400);
}

async function send(sale: QueuedSale): Promise<void> {
  await updateSale(sale.client_uuid, { status: "syncing" });
  try {
    const r = await frappeCall<SaleResult>(
      "cago.api.sales.quick_sale",
      { ...sale.args, client_uuid: sale.client_uuid, posted_at: sale.posted_at },
      { background: true }, // a background flush must never hijack the page with a 401 redirect
    );
    if (r.cancelled) {
      // The matching invoice was voided server-side — this sale was NOT booked. Surface it so the
      // owner re-rings it, rather than showing a green "done" against a cancelled invoice.
      await updateSale(sale.client_uuid, { status: "failed", error: "Hoá đơn đã bị huỷ trên hệ thống — cần bán lại đơn này." });
      return;
    }
    await updateSale(sale.client_uuid, { status: "done", invoice: r.invoice, error: undefined });
  } catch (e) {
    if (e instanceof FrappeError && !isTransient(e)) {
      await updateSale(sale.client_uuid, { status: "failed", error: e.message });
    } else {
      await updateSale(sale.client_uuid, { status: "pending" });
      throw e; // stop the run; the connection/server/session is gone — retry later, don't mark failed
    }
  }
}

/** Refresh the CSRF token from a fresh bootstrap before flushing. A tablet that booted the cached
 *  /pos/sell shell offline has an empty token; without this, every queued sale's POST would 400 on
 *  CSRF and (pre-fix) get wrongly marked failed. Best-effort: if still offline this throws and drain
 *  simply finds nothing reachable. */
async function refreshSession(): Promise<void> {
  try {
    const boot = await frappeCall<{ csrf_token?: string; is_guest?: boolean }>("cago.api.session.bootstrap", {}, { method: "GET", background: true });
    // Only adopt the token if the session is still a real signed-in one. If bootstrap comes back as
    // GUEST (cookie expired), do NOT install the guest token — that would make every queued quick_sale
    // 403 and (with 403 non-transient) fail; better to let the sale 403→failed so the owner re-rings it
    // after logging in, than to look "fine" with a guest token.
    if (boot?.csrf_token && !boot?.is_guest) setCsrfToken(boot.csrf_token);
  } catch {
    /* still offline / server down — drain will no-op on the network error */
  }
}

async function drain(): Promise<number> {
  let synced = 0;
  const pending = (await listQueue()).filter((s) => s.status === "pending" || s.status === "syncing");
  if (!pending.length) return 0;
  await refreshSession(); // ensure a live CSRF token before POSTing the queue
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
