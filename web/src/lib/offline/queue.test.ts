import { beforeEach, describe, expect, it } from "vitest";
import { db, type SaleArgs, type SaleDisplay } from "./db";
import { enqueueSale, listQueue, purgeDone, queueCounts, retrySale, updateSale } from "./queue";

const args: SaleArgs = { items: [{ item_code: "X", qty: 1, uom: "Cái" }], payment_mode: "cash" };
const display: SaleDisplay = { total_text: "10.000đ", item_count: 1, payment_mode: "cash", lines: [] };

beforeEach(async () => {
  const d = await db();
  await d.clear("queue");
  await d.clear("meta");
});

describe("offline sale queue", () => {
  it("enqueues with a client_uuid, a TẠM- code, posted_at and pending status", async () => {
    const sale = await enqueueSale(args, display);
    expect(sale.client_uuid).toBeTruthy();
    expect(sale.local_code).toMatch(/^TẠM-[A-Z0-9]{1,6}$/);
    expect(sale.posted_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(sale.status).toBe("pending");
    expect(sale.args).toEqual(args);
  });

  it("lists queued sales in FIFO (created_at) order", async () => {
    const a = await enqueueSale(args, display);
    const b = await enqueueSale(args, display);
    const codes = (await listQueue()).map((s) => s.client_uuid);
    expect(codes).toEqual([a.client_uuid, b.client_uuid]);
  });

  it("counts pending/syncing vs failed", async () => {
    const a = await enqueueSale(args, display);
    const b = await enqueueSale(args, display);
    await updateSale(b.client_uuid, { status: "failed", error: "over limit" });
    await updateSale(a.client_uuid, { status: "syncing" });
    expect(await queueCounts()).toEqual({ pending: 1, failed: 1 });
  });

  it("purgeDone drops only synced sales (keeps failed for owner attention)", async () => {
    const done = await enqueueSale(args, display);
    const failed = await enqueueSale(args, display);
    await updateSale(done.client_uuid, { status: "done", invoice: "INV-1" });
    await updateSale(failed.client_uuid, { status: "failed", error: "x" });
    await purgeDone();
    const left = (await listQueue()).map((s) => s.status);
    expect(left).toEqual(["failed"]);
  });

  it("retrySale resets a failed sale to pending and clears the error", async () => {
    const s = await enqueueSale(args, display);
    await updateSale(s.client_uuid, { status: "failed", error: "boom" });
    await retrySale(s.client_uuid);
    const after = (await listQueue())[0];
    expect(after.status).toBe("pending");
    expect(after.error).toBeUndefined();
  });

  it("generates a unique client_uuid per sale (idempotency key)", async () => {
    const a = await enqueueSale(args, display);
    const b = await enqueueSale(args, display);
    expect(a.client_uuid).not.toBe(b.client_uuid);
  });
});
