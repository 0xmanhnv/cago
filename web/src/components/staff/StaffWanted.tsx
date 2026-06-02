"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { DateHeader, FilterTabs, groupOrdered, SearchInput } from "@/components/ui/ListUI";

const STATUS_VI: Record<string, string> = {
  New: "Mới",
  Processing: "Đang xử lý",
  Completed: "Hoàn tất",
  Expired: "Hết hạn",
  Cancelled: "Đã huỷ",
};

interface WantedItem {
  display_name: string;
  qty: number;
  uom?: string;
  shelf_location?: string;
  price_text: string;
  amount_text?: string;
  is_chemical?: boolean;
}
interface WantedList {
  code: string;
  status: string;
  is_expired?: boolean;
  note?: string;
  created?: string;
  item_count?: number;
  total_text?: string;
  items: WantedItem[];
}
interface WantedSummary {
  code: string;
  status: string;
  item_count: number;
  total_qty: number;
  summary: string;
  note?: string;
  created: string;
  date_group?: string;
  time?: string;
  is_expired?: boolean;
}

export function StaffWanted() {
  const router = useRouter();
  const [orders, setOrders] = useState<WantedSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeDone, setIncludeDone] = useState(false);
  const [listQ, setListQ] = useState("");
  const [wl, setWl] = useState<WantedList | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadList = async (done = includeDone) => {
    setLoading(true);
    try {
      const r = await frappeCall<WantedSummary[]>(
        "cago.api.staff.list_wanted_lists",
        { include_done: done ? 1 : 0 },
        { method: "GET" },
      );
      setOrders(r || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadList(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = async (c: string) => {
    setMsg("");
    setWl(null);
    try {
      const r = await frappeCall<WantedList>("cago.api.staff.get_wanted_list", { code: c.trim() }, { method: "GET" });
      setWl(r);
    } catch {
      setMsg("Không tìm thấy đơn với mã này.");
    }
  };
  // Typing/scanning a full code (WL-YYYY-NNNNN) opens that order directly — even if it's not in
  // the currently loaded/open list — so one search box replaces the old separate "tra theo mã".
  useEffect(() => {
    const c = listQ.trim();
    if (!/^WL-\d{4}-\d+$/i.test(c)) return;
    const id = setTimeout(() => void open(c.toUpperCase()), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQ]);
  const setStatus = async (status: string) => {
    if (!wl || busy) return;
    setBusy(true);
    try {
      const r = await frappeCall<{ status: string }>("cago.api.staff.set_wanted_list_status", { code: wl.code, status });
      setWl({ ...wl, status: r.status });
      void loadList();
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : "không đổi được trạng thái."}`);
    } finally {
      setBusy(false);
    }
  };
  const cancelOrder = async () => {
    if (!wl || busy) return;
    if (!(await confirmDialog(`Huỷ đơn ${wl.code}? (khách không lấy nữa)`, { danger: true, confirmLabel: "Huỷ đơn" }))) return;
    setBusy(true);
    try {
      await frappeCall<{ status: string }>("cago.api.staff.cancel_wanted_list", { code: wl.code });
      setWl(null);
      void loadList();
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : "không huỷ được."}`);
    } finally {
      setBusy(false);
    }
  };
  // Bring the order into the Cago POS to collect payment (cash/bank/credit) — NOT the raw
  // ERPNext desk invoice. The sell screen pre-loads these items and marks the order Completed.
  const createInvoice = () => {
    if (!wl) return;
    router.push(`/pos/sell?wanted=${encodeURIComponent(wl.code)}`);
  };

  // ---- Detail view -------------------------------------------------------
  if (wl) {
    return (
      <div>
        <div className="mb-3.5 flex items-center gap-2.5">
          <button onClick={() => setWl(null)} className="shrink-0 whitespace-nowrap rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
            ‹ Danh sách đơn
          </button>
        </div>
        <div className="rounded-xl bg-white p-4">
          {/* Header: code + status badge + when it was placed (helps staff judge recency). */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-lg font-bold">Đơn {wl.code}</h3>
              {wl.created && <div className="mt-0.5 text-sm text-slate-400">🕒 {wl.created}</div>}
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
                wl.status === "Completed"
                  ? "bg-emerald-100 text-emerald-700"
                  : wl.status === "Cancelled"
                  ? "bg-slate-200 text-slate-500"
                  : wl.status === "Processing"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {STATUS_VI[wl.status] || wl.status}
            </span>
          </div>

          {wl.is_expired && (
            <div className="mt-2 rounded-lg border border-amber-400 bg-amber-100 p-3 text-amber-900">
              ⏰ Đơn đã quá hạn (&gt;2 ngày), nên xác nhận lại với khách.
            </div>
          )}
          {wl.note && <div className="mt-2 rounded-lg bg-slate-50 p-2 text-slate-600">📝 {wl.note}</div>}

          {/* Line items: prominent qty, shelf location for picking, chemical chip, line total. */}
          <div className="mt-3">
            {wl.items.map((i, idx) => (
              <div key={idx} className="flex items-start justify-between gap-3 border-b border-slate-100 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <b className="leading-tight">{i.display_name}</b>
                    {i.is_chemical && (
                      <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-xs font-bold text-rose-700">⚠ Hoá chất</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700">
                      SL {i.qty} {i.uom || ""}
                    </span>
                    {i.shelf_location && <span>📍 {i.shelf_location}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-bold">{i.amount_text || i.price_text}</div>
                  <div className="whitespace-nowrap text-xs text-slate-400">{i.price_text}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Total — the figure staff confirms before collecting payment. */}
          {wl.total_text && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-light/60 px-3.5 py-2.5">
              <span className="font-bold text-slate-600">Tổng{wl.item_count ? ` (${wl.item_count} mặt hàng)` : ""}</span>
              <span className="text-2xl font-extrabold text-brand">{wl.total_text}</span>
            </div>
          )}

          {/* Primary action first: most orders just go straight to payment. */}
          <button onClick={createInvoice} disabled={busy} className="mt-3 min-h-touch w-full rounded-xl bg-teal-600 py-3.5 text-lg font-extrabold text-white disabled:opacity-50">
            {busy ? "Đang xử lý..." : "🛒 Bán / thu tiền cho đơn này"}
          </button>

          {/* Status as a segmented control — the current state is clearly highlighted, the other is the action. */}
          {wl.status !== "Cancelled" && wl.status !== "Completed" && (
            <div className="mt-2.5">
              <div className="mb-1 text-sm font-bold text-slate-500">Trạng thái soạn hàng</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStatus("Processing")}
                  disabled={busy || wl.status === "Processing"}
                  className={`min-h-[48px] flex-1 rounded-xl font-bold ${
                    wl.status === "Processing" ? "bg-blue-600 text-white ring-2 ring-blue-300" : "border-2 border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  ⏳ Đang xử lý
                </button>
                <button
                  onClick={() => setStatus("Completed")}
                  disabled={busy}
                  className="min-h-[48px] flex-1 rounded-xl border-2 border-emerald-300 bg-white font-bold text-emerald-700"
                >
                  ✅ Đánh dấu hoàn tất
                </button>
              </div>
            </div>
          )}

          {wl.status !== "Cancelled" && wl.status !== "Completed" && (
            <button onClick={cancelOrder} disabled={busy} className="mt-3 w-full py-2 text-sm font-bold text-red-500 underline disabled:opacity-50">
              🗑 Huỷ đơn (khách không lấy nữa)
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---- List view ---------------------------------------------------------
  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2.5">
        <button onClick={() => router.push("/pos")} className="shrink-0 whitespace-nowrap rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ‹ Trang chủ
        </button>
        <div className="flex-1 text-2xl font-bold">KHÁCH ĐÃ CHỌN</div>
      </div>

      {msg && <div className="mb-3 rounded-lg border border-amber-400 bg-amber-100 p-3 text-amber-900">{msg}</div>}

      {/* One search: filters the list live, and opens the order directly when a full code
          (WL-YYYY-NNNNN) is typed or scanned — no separate "tra theo mã" box. */}
      <SearchInput value={listQ} onChange={setListQ} placeholder="🔎 Tìm / quét mã đơn, hoặc tên hàng..." />
      <FilterTabs
        active={includeDone ? "all" : "open"}
        onChange={(k) => {
          const v = k === "all";
          setIncludeDone(v);
          void loadList(v);
        }}
        tabs={[
          { key: "open", label: "Đang chờ" },
          { key: "all", label: "Tất cả" },
        ]}
      />

      {(() => {
        const t = listQ.trim().toLowerCase();
        const list = t ? orders.filter((o) => `${o.code} ${o.summary}`.toLowerCase().includes(t)) : orders;
        if (loading) return <div className="py-6 text-center text-slate-500">Đang tải...</div>;
        if (list.length === 0)
          return <div className="rounded-xl bg-white p-6 text-center text-slate-400">{t ? "Không tìm thấy đơn." : "Chưa có đơn nào khách chọn."}</div>;
        return groupOrdered(list, (o) => o.date_group || o.created).map((g) => (
          <div key={g.label}>
            <DateHeader label={g.label} />
            {g.items.map((o) => (
              <button
                key={o.code}
                onClick={() => open(o.code)}
                className="mb-2.5 flex w-full items-center justify-between gap-3 rounded-xl bg-white p-3.5 text-left shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{o.code}</span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold">{STATUS_VI[o.status] || o.status}</span>
                    {o.is_expired && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">quá hạn</span>}
                  </div>
                  <div className="truncate text-slate-600">{o.summary}</div>
                  <div className="text-xs text-slate-400">
                    {o.item_count} mặt hàng · {o.time || o.created}
                  </div>
                </div>
                <div className="text-2xl text-slate-300">›</div>
              </button>
            ))}
          </div>
        ));
      })()}
    </div>
  );
}
