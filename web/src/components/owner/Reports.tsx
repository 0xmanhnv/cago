"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import type { Batch } from "@/lib/types";
import { BackBar, Ok } from "./OwnerShared";

export function LowStock() {
  const router = useRouter();
  const [list, setList] = useState<{ display_name: string; shelf_location?: string; status: string; qty?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    frappeCall<typeof list>("cago.api.reports.low_stock", {}, { method: "GET" }).then((r) => {
      setList(r || []);
      setLoading(false);
    });
  }, []);
  return (
    <div>
      <BackBar onBack={() => router.push("/owner")} title="HÀNG SẮP HẾT" />
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : list.length === 0 ? (
        <Ok>Không có hàng nào sắp hết. 👍</Ok>
      ) : (
        list.map((p, i) => (
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
    </div>
  );
}

export function Report() {
  const router = useRouter();
  type Summary = { period_label: string; sales_total_text: string; invoice_count: number };
  type Split = { cash_text: string; bank_text: string; other_text: string; credit_text: string };
  type Profit = { revenue_text: string; cogs_text: string; profit_text: string; margin_pct: number };
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");
  const [s, setS] = useState<Summary | null>(null);
  const [split, setSplit] = useState<Split | null>(null);
  const [profit, setProfit] = useState<Profit | null>(null);
  const [best, setBest] = useState<{ display_name: string; qty: number }[]>([]);
  useEffect(() => {
    frappeCall<Summary>("cago.api.reports.period_summary", { period }, { method: "GET" }).then(setS);
    frappeCall<Split>("cago.api.reports.payment_split", { period }, { method: "GET" }).then(setSplit).catch(() => setSplit(null));
    frappeCall<Profit>("cago.api.reports.gross_profit", { period }, { method: "GET" }).then(setProfit).catch(() => setProfit(null));
    frappeCall<{ display_name: string; qty: number }[]>("cago.api.reports.best_sellers", { limit: 5 }, { method: "GET" }).then((r) => setBest(r || []));
  }, [period]);

  const tab = (p: "today" | "week" | "month", label: string) => (
    <button
      onClick={() => setPeriod(p)}
      className={`rounded-xl px-4 py-3 font-bold ${p === period ? "bg-blue-600 text-white" : "bg-brand-light text-brand-dark"}`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <BackBar onBack={() => router.push("/owner")} title="BÁO CÁO" />
      <div className="mb-3 flex gap-2">
        {tab("today", "Hôm nay")}
        {tab("week", "Tuần")}
        {tab("month", "Tháng")}
      </div>
      <div className="rounded-xl bg-white p-4">
        {!s ? (
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
      <BackBar onBack={() => router.push("/owner")} title="LÔ SẮP HẾT HẠN (60 ngày)" />
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
