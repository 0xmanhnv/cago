"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { SearchInput } from "@/components/ui/ListUI";
import type { Batch } from "@/lib/types";
import { BackBar, goBackSmart, Ok } from "./OwnerShared";

export function LowStock() {
  const router = useRouter();
  const [list, setList] = useState<{ display_name: string; shelf_location?: string; status: string; qty?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  useEffect(() => {
    frappeCall<typeof list>("cago.api.reports.low_stock", {}, { method: "GET" }).then((r) => {
      setList(r || []);
      setLoading(false);
    });
  }, []);
  const text = q.trim().toLowerCase();
  const filtered = text ? list.filter((p) => `${p.display_name} ${p.shelf_location || ""}`.toLowerCase().includes(text)) : list;
  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="HÀNG SẮP HẾT" />
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : list.length === 0 ? (
        <Ok>Không có hàng nào sắp hết. 👍</Ok>
      ) : (
        <>
          <div className="mb-2 rounded-xl bg-amber-50 p-2.5 text-center font-bold text-amber-700">{list.length} mặt hàng sắp hết</div>
          <SearchInput value={q} onChange={setQ} placeholder="🔎 Tìm theo tên / vị trí kệ..." />
          {filtered.length === 0 ? (
            <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tìm thấy mặt hàng.</div>
          ) : (
            filtered.map((p, i) => (
              <div key={i} className="mb-2 flex items-center justify-between rounded-xl bg-white p-3.5 shadow">
                <div>
                  <div className="font-bold">{p.display_name}</div>
                  <div className="text-slate-500">
                    {p.shelf_location || ""}
                    {p.qty ? ` · còn ${p.qty}` : ""}
                  </div>
                </div>
                <div className="font-bold text-red-600">{p.status}</div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

type Period = "today" | "week" | "month" | "year" | "custom";

export function Report() {
  const router = useRouter();
  type Summary = { period_label: string; sales_total_text: string; invoice_count: number };
  type Split = { cash_text: string; bank_text: string; other_text: string; credit_text: string };
  type Profit = { revenue_text: string; cogs_text: string; profit_text: string; margin_pct: number };
  const [period, setPeriod] = useState<Period>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [s, setS] = useState<Summary | null>(null);
  const [split, setSplit] = useState<Split | null>(null);
  const [profit, setProfit] = useState<Profit | null>(null);
  const [best, setBest] = useState<{ display_name: string; qty: number }[]>([]);
  const [byCust, setByCust] = useState<{ customer_name: string; total_text: string }[]>([]);
  const ready = period !== "custom" || (!!fromDate && !!toDate); // custom needs both dates

  useEffect(() => {
    if (!ready) return;
    const args = { period, from_date: fromDate || undefined, to_date: toDate || undefined };
    setS(null);
    frappeCall<Summary>("cago.api.reports.period_summary", args, { method: "GET" }).then(setS);
    frappeCall<Split>("cago.api.reports.payment_split", args, { method: "GET" }).then(setSplit).catch(() => setSplit(null));
    frappeCall<Profit>("cago.api.reports.gross_profit", args, { method: "GET" }).then(setProfit).catch(() => setProfit(null));
    frappeCall<{ display_name: string; qty: number }[]>("cago.api.reports.best_sellers", { limit: 5 }, { method: "GET" }).then((r) => setBest(r || []));
    frappeCall<{ customer_name: string; total_text: string }[]>("cago.api.reports.sales_by_customer", { ...args, limit: 5 }, { method: "GET" }).then((r) => setByCust(r || []));
  }, [period, fromDate, toDate, ready]);

  const tab = (p: Period, label: string) => (
    <button
      onClick={() => setPeriod(p)}
      className={`rounded-xl px-3.5 py-2.5 font-bold ${p === period ? "bg-blue-600 text-white" : "bg-brand-light text-brand-dark"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="BÁO CÁO" />
      <div className="mb-3 flex flex-wrap gap-2">
        {tab("today", "Hôm nay")}
        {tab("week", "Tuần")}
        {tab("month", "Tháng")}
        {tab("year", "Năm")}
        {tab("custom", "Khoảng ngày")}
      </div>
      {period === "custom" && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm">
          <label className="font-bold text-slate-600">Từ</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border-2 border-emerald-300 p-2" />
          <label className="font-bold text-slate-600">đến</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border-2 border-emerald-300 p-2" />
        </div>
      )}
      <div className="rounded-xl bg-white p-4">
        {!ready ? (
          <div className="text-center text-slate-500">Chọn từ ngày và đến ngày để xem báo cáo.</div>
        ) : !s ? (
          <div className="text-slate-500">Đang tải...</div>
        ) : (
          <>
            <div className="flex justify-between border-b border-slate-100 py-2">
              <span className="text-slate-500">Kỳ</span>
              <b>{s.period_label}</b>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-2">
              <span className="text-slate-500">Doanh thu</span>
              <span className="text-2xl font-extrabold text-brand">{s.sales_total_text}</span>
            </div>
            <div className="flex justify-between border-b border-slate-100 py-2">
              <span className="text-slate-500">Số hóa đơn</span>
              <b>{s.invoice_count}</b>
            </div>
            {profit && (
              <div className="mt-1 rounded-lg bg-emerald-50 px-2.5 py-1.5">
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">📈 Lãi gộp ước tính</span>
                  <b className="text-brand">
                    {profit.profit_text} ({profit.margin_pct}%)
                  </b>
                </div>
                <div className="text-xs text-slate-500">Doanh thu {profit.revenue_text} − giá vốn {profit.cogs_text}</div>
              </div>
            )}
            {split && (
              <div className="mt-1">
                <div className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="text-slate-500">💵 Tiền mặt</span>
                  <b>{split.cash_text}</b>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="text-slate-500">🏦 Chuyển khoản</span>
                  <b>{split.bank_text}</b>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="text-slate-500">📝 Đang nợ (chưa thu)</span>
                  <b className="text-red-600">{split.credit_text}</b>
                </div>
              </div>
            )}
            {best.length > 0 ? (
              <>
                <div className="mt-2.5 font-bold">Bán chạy</div>
                {best.map((b, i) => (
                  <div key={i} className="flex justify-between border-b border-slate-100 py-1.5">
                    <span>{b.display_name}</span>
                    <b>{b.qty}</b>
                  </div>
                ))}
              </>
            ) : (
              <div className="mt-2.5 text-slate-500">Chưa có dữ liệu bán hàng.</div>
            )}
            {byCust.length > 0 && (
              <>
                <div className="mt-2.5 font-bold">Khách mua nhiều</div>
                {byCust.map((c, i) => (
                  <div key={i} className="flex justify-between border-b border-slate-100 py-1.5">
                    <span>{c.customer_name}</span>
                    <b>{c.total_text}</b>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ExpiryReport() {
  const router = useRouter();
  const [rows, setRows] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    frappeCall<Batch[]>("cago.api.inventory.expiring_soon", { days: 60 }, { method: "GET" }).then((r) => {
      setRows(r || []);
      setLoading(false);
    });
  }, []);
  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="LÔ SẮP HẾT HẠN (60 ngày)" />
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : rows.length === 0 ? (
        <Ok>Không có lô nào sắp hết hạn. 👍</Ok>
      ) : (
        rows.map((b) => (
          <div key={b.batch} className="mb-2 flex items-center justify-between rounded-xl bg-white p-3.5 shadow">
            <div>
              <div className="font-bold">{b.display_name}</div>
              <div className="text-slate-500">
                Lô {b.batch_id} · HSD {b.expiry_text}
              </div>
            </div>
            <div className={b.expiry_status === "expired" ? "font-bold text-red-600" : "font-bold text-amber-600"}>
              {b.expiry_status === "expired" ? "Đã hết hạn" : `Còn ${b.days_left} ngày`}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
