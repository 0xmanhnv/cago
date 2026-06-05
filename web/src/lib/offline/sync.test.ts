import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the API layer so flush logic is tested without a server.
vi.mock("@/lib/api", () => {
  class FrappeError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "FrappeError";
      this.status = status;
    }
  }
  return { FrappeError, frappeCall: vi.fn() };
});

import { FrappeError, frappeCall } from "@/lib/api";
import { db, type SaleArgs, type SaleDisplay } from "./db";
import { enqueueSale, listQueue } from "./queue";
import { flushQueue } from "./sync";

const mockCall = frappeCall as unknown as ReturnType<typeof vi.fn>;
const args: SaleArgs = { items: [{ item_code: "X", qty: 1, uom: "Cái" }], payment_mode: "cash" };
const display: SaleDisplay = { total_text: "10.000đ", item_count: 1, payment_mode: "cash", lines: [] };

beforeEach(async () => {
  const d = await db();
  await d.clear("queue");
  mockCall.mockReset();
});

describe("offline queue flush", () => {
  it("syncs a pending sale → done, sending client_uuid + posted_at to quick_sale", async () => {
    const sale = await enqueueSale(args, display);
    mockCall.mockResolvedValue({ invoice: "ACC-SINV-1", total_text: "10.000đ" });
    const n = await flushQueue();
    expect(n).toBe(1);
    const [method, payload] = mockCall.mock.calls[0];
    expect(method).toBe("cago.api.sales.quick_sale");
    expect(payload).toMatchObject({ client_uuid: sale.client_uuid, posted_at: sale.posted_at, payment_mode: "cash" });
    const after = (await listQueue())[0];
    expect(after.status).toBe("done");
    expect(after.invoice).toBe("ACC-SINV-1");
  });

  it("keeps a sale pending on a network error (retry next time)", async () => {
    await enqueueSale(args, display);
    mockCall.mockRejectedValue(new TypeError("Failed to fetch"));
    const n = await flushQueue();
    expect(n).toBe(0);
    expect((await listQueue())[0].status).toBe("pending");
  });

  it("marks a sale failed on a business error (server rejected — won't fix itself)", async () => {
    await enqueueSale(args, display);
    mockCall.mockRejectedValue(new FrappeError("Vượt hạn mức nợ", 417));
    await flushQueue();
    const after = (await listQueue())[0];
    expect(after.status).toBe("failed");
    expect(after.error).toContain("hạn mức");
  });

  it("stops at the first network error, leaving later sales pending", async () => {
    await enqueueSale(args, display);
    await enqueueSale(args, display);
    mockCall.mockRejectedValueOnce(new TypeError("offline")); // first send fails → break
    mockCall.mockResolvedValue({ invoice: "INV-2", total_text: "x" });
    const n = await flushQueue();
    expect(n).toBe(0);
    expect((await listQueue()).every((s) => s.status === "pending")).toBe(true);
  });
});
