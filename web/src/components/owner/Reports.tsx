"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { SearchInput } from "@/components/ui/ListUI";
import { SkeletonRows } from "@/components/ui/Skeleton";
import type { Batch } from "@/lib/types";
import { BackBar, goBackSmart, Ok } from "./Shared";

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
        <SkeletonRows rows={6} thumb={false} />
      ) : list.length === 0 ? (
        <Ok>Không có hàng nào sắp hết. 👍</Ok>
      ) : (
        <>
          <div className="mb-2 rounded-xl bg-amber-50 p-2.5 text-center font-bold text-amber-700">{list.length} mặt hàng sắp hết</div>
          <SearchInput value={q} onChange={setQ} placeholder="🔎 Tìm theo tên / vị trí kệ..." />
          {filtered.length === 0 ? (
            <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tìm thấy mặt hàng.</div>
          ) : (
            <div className="xl:grid xl:grid-cols-2 xl:gap-x-3">
            {filtered.map((p, i) => (
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
            ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

type Period = "today" | "week" | "month" | "year" | "custom";

// Hourly revenue trend, Hôm nay (solid green) vs Hôm qua (dashed amber). Hand-drawn SVG — no chart
// library (keeps the bundle small, matches the project's "simple" ethos). Learnt from a VN POS report.
function TrendChart({ h }: { h: { today: number[]; yesterday: number[]; max: number; today_total_text: string; yesterday_total_text: string } }) {
  const W = 320,
    H = 120,
    padL = 3,
    padR = 3,
    padT = 8,
    padB = 14;
  const max = h.max || 1;
  const x = (i: number) => padL + (i / 23) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const path = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-bold text-slate-600">📈 Xu hướng theo giờ</span>
        <span className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-brand" /> Hôm nay <b className="text-brand">{h.today_total_text}</b></span>
          <span className="flex items-center gap-1"><span className="inline-block h-0 w-3.5 border-t-2 border-dashed border-harvest" /> Hôm qua {h.yesterday_total_text}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 132 }} aria-hidden>
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#e2e8f0" strokeWidth={1} />
        <path d={path(h.yesterday)} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <path d={path(h.today)} fill="none" stroke="#16a34a" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
    </div>
  );
}

export function Report() {
  const router = useRouter();
  type Summary = { period_label: string; sales_total_text: string; invoice_count: number; customer_count: number; avg_text: string };
  type Split = { cash_text: string; bank_text: string; other_text: string; credit_text: string };
  type Profit = { revenue_text: string; cogs_text: string; profit_text: string; margin_pct: number };
  type Hourly = { today: number[]; yesterday: number[]; max: number; today_total_text: string; yesterday_total_text: string };
  const [period, setPeriod] = useState<Period>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [s, setS] = useState<Summary | null>(null);
  const [hourly, setHourly] = useState<Hourly | null>(null);
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
    // Hourly trend (today vs yesterday) only makes sense for the day view.
    setHourly(null);
    if (period === "today") frappeCall<Hourly>("cago.api.reports.revenue_by_hour", {}, { method: "GET" }).then(setHourly).catch(() => setHourly(null));
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
          <SkeletonRows rows={5} thumb={false} />
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
            <div className="mt-2 flex gap-2">
              <div className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-center">
                <div className="text-xs text-slate-400">Khách hàng</div>
                <div className="text-lg font-extrabold text-slate-700">{s.customer_count}</div>
              </div>
              <div className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-center">
                <div className="text-xs text-slate-400">Trung bình/đơn</div>
                <div className="text-lg font-extrabold text-slate-700">{s.avg_text}</div>
              </div>
            </div>
            {hourly && <TrendChart h={hourly} />}
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
        <SkeletonRows rows={6} thumb={false} />
      ) : rows.length === 0 ? (
        <Ok>Không có lô nào sắp hết hạn. 👍</Ok>
      ) : (
        <div className="xl:grid xl:grid-cols-2 xl:gap-x-3">
        {rows.map((b) => (
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
        ))}
        </div>
      )}
    </div>
  );
}
