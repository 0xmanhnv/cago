"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { FilterTabs, SearchInput } from "@/components/ui/ListUI";
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
      <BackBar onBack={() => goBackSmart(router)} title="📦 Hàng sắp hết" />
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

// A date field we fully control the LOOK of — native <input type="date"> renders inconsistently across
// devices (some show a blank grey box with no mm/dd/yyyy hint). We draw a clean white field showing the
// picked date (dd/MM/yyyy) or a "Chọn ngày…" placeholder + 📅, with a transparent native date input on
// top so a tap still opens the system calendar (and showPicker() on browsers that support it).
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const open = () => {
    const el = ref.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* fall through */
      }
    }
    el.focus();
  };
  const display = value ? value.split("-").reverse().join("/") : "";
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-slate-600">{label}</span>
      <div className="relative">
        <div className="flex items-center justify-between rounded-lg border-2 border-emerald-300 bg-white p-3">
          <span className={display ? "font-bold text-slate-800" : "text-slate-400"}>{display || "Chọn ngày…"}</span>
          <span className="text-lg leading-none">📅</span>
        </div>
        <input
          ref={ref}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={open}
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </label>
  );
}

// Hourly revenue trend, Hôm nay (solid green) vs Hôm qua (dashed amber). Hand-drawn SVG — no chart
// library (keeps the bundle small, matches the project's "simple" ethos). Learnt from a VN POS report.
function TrendChart({
  h,
  curLabel = "Hôm nay",
  prevLabel = "Hôm qua",
}: {
  h: { today: number[]; yesterday: number[]; max: number; today_total_text: string; yesterday_total_text: string };
  curLabel?: string;
  prevLabel?: string;
}) {
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
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-brand" /> {curLabel} <b className="text-brand">{h.today_total_text}</b></span>
          <span className="flex items-center gap-1"><span className="inline-block h-0 w-3.5 border-t-2 border-dashed border-harvest" /> {prevLabel} {h.yesterday_total_text}</span>
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
  const [dayOffset, setDayOffset] = useState(0); // day view: 0 = today, -1 = yesterday, … (‹ › stepper)
  const [reportTab, setReportTab] = useState<"sales" | "profit" | "stock" | "cashflow">("sales");
  const ready = period !== "custom" || (!!fromDate && !!toDate); // custom needs both dates

  // Local YYYY-MM-DD for `today + off` (local, not UTC — avoids a near-midnight off-by-one in VN).
  const dayStr = (off: number) => {
    const d = new Date();
    d.setDate(d.getDate() + off);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const dayLabel = (off: number) => (off === 0 ? "Hôm nay" : off === -1 ? "Hôm qua" : dayStr(off).split("-").reverse().join("/"));
  const onDay = period === "today";

  useEffect(() => {
    if (!ready) return;
    // The Ngày view can step back to a past day (dayOffset) — that day becomes a 1-day custom range.
    const args =
      onDay && dayOffset !== 0
        ? { period: "custom" as const, from_date: dayStr(dayOffset), to_date: dayStr(dayOffset) }
        : { period, from_date: fromDate || undefined, to_date: toDate || undefined };
    // Guard against out-of-order responses: rapidly stepping days fires several batches; a slower older
    // response must not overwrite a newer one. `live` is flipped false by the cleanup on the next run.
    let live = true;
    setS(null);
    setHourly(null);
    frappeCall<Summary>("cago.api.reports.period_summary", args, { method: "GET" }).then((r) => { if (live) setS(r); });
    // Hourly trend (that day vs the day before) only makes sense for the day view.
    if (onDay) frappeCall<Hourly>("cago.api.reports.revenue_by_hour", { date: dayStr(dayOffset) }, { method: "GET" }).then((r) => { if (live) setHourly(r); }).catch(() => { if (live) setHourly(null); });
    frappeCall<Split>("cago.api.reports.payment_split", args, { method: "GET" }).then((r) => { if (live) setSplit(r); }).catch(() => { if (live) setSplit(null); });
    frappeCall<Profit>("cago.api.reports.gross_profit", args, { method: "GET" }).then((r) => { if (live) setProfit(r); }).catch(() => { if (live) setProfit(null); });
    // best_sellers is period-scoped like every other panel (was all-time — inconsistent with the page).
    frappeCall<{ display_name: string; qty: number }[]>("cago.api.reports.best_sellers", { ...args, limit: 5 }, { method: "GET" }).then((r) => { if (live) setBest(r || []); });
    frappeCall<{ customer_name: string; total_text: string }[]>("cago.api.reports.sales_by_customer", { ...args, limit: 5 }, { method: "GET" }).then((r) => { if (live) setByCust(r || []); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, fromDate, toDate, ready, dayOffset]);

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="📊 Báo cáo" />
      {/* Report-type tabs (underline, like a polished VN POS): Bán hàng / Lãi lỗ / Kho hàng / Thu chi.
          The period selector below is shared across them. */}
      <div className="mb-3 flex border-b border-slate-200">
        {([["sales", "Bán hàng"], ["profit", "Lãi lỗ"], ["stock", "Kho hàng"], ["cashflow", "Thu chi"]] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setReportTab(k)}
            className={`flex-1 border-b-2 px-1 py-2.5 text-sm font-bold ${reportTab === k ? "border-brand text-brand" : "border-transparent text-slate-500"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {/* Shared FilterTabs (green-active, no-wrap scroll, uniform pills) — was a flex-wrap row of
          off-brand BLUE buttons that wrapped "Khoảng ngày" onto a lonely 2nd line. */}
      <FilterTabs
        active={period}
        onChange={(k) => {
          setPeriod(k as Period);
          setDayOffset(0);
        }}
        tabs={[
          { key: "today", label: "Hôm nay" },
          { key: "week", label: "Tuần" },
          { key: "month", label: "Tháng" },
          { key: "year", label: "Năm" },
          { key: "custom", label: "Khoảng ngày" },
        ]}
      />
      {period === "custom" && (
        // Two clearly-labelled full-width date fields (was a flex-wrap row where "đến" orphaned from
        // its input and the empty native inputs read as stray grey boxes).
        <div className="mb-3 space-y-2 rounded-xl bg-white p-3 shadow-sm">
          <DateField label="Từ ngày" value={fromDate} onChange={setFromDate} />
          <DateField label="Đến ngày" value={toDate} onChange={setToDate} />
        </div>
      )}
      {onDay && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-white p-2 shadow-sm">
          <button onClick={() => setDayOffset((o) => o - 1)} aria-label="Ngày trước" className="rounded-lg bg-slate-100 px-5 py-2 text-xl font-bold text-slate-600">‹</button>
          <span className="font-extrabold text-brand-dark">📅 {dayLabel(dayOffset)}</span>
          <button onClick={() => setDayOffset((o) => Math.min(0, o + 1))} disabled={dayOffset >= 0} aria-label="Ngày sau" className="rounded-lg bg-slate-100 px-5 py-2 text-xl font-bold text-slate-600 disabled:opacity-30">›</button>
        </div>
      )}
      {/* ── BÁN HÀNG ── KPIs + hourly trend + best sellers + top customers */}
      {reportTab === "sales" && (
        <div className="rounded-xl bg-white p-4">
          {!ready ? (
            <div className="text-center text-slate-500">Chọn từ ngày và đến ngày để xem báo cáo.</div>
          ) : !s ? (
            <SkeletonRows rows={5} thumb={false} />
          ) : (
            <>
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
              {hourly && (
                <TrendChart h={hourly} curLabel={dayOffset === 0 ? "Hôm nay" : "Ngày này"} prevLabel={dayOffset === 0 ? "Hôm qua" : "Ngày trước"} />
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
      )}

      {/* ── LÃI LỖ ── owner-only (cost-derived); degrades to a note if gross_profit is forbidden */}
      {reportTab === "profit" && (
        <div className="rounded-xl bg-white p-4">
          {!ready ? (
            <div className="text-center text-slate-500">Chọn khoảng thời gian để xem.</div>
          ) : profit ? (
            <>
              <div className="text-center text-slate-500">Lợi nhuận gộp ước tính{s ? ` · ${s.period_label}` : ""}</div>
              <div className="my-1 text-center text-3xl font-extrabold text-brand">{profit.profit_text}</div>
              <div className="mb-3 text-center text-sm text-slate-500">Biên lợi nhuận {profit.margin_pct}%</div>
              <div className="flex items-center justify-around rounded-xl bg-emerald-50 p-3 text-center">
                <div>
                  <div className="text-xs text-slate-500">Doanh thu</div>
                  <b>{profit.revenue_text}</b>
                </div>
                <span className="text-xl text-slate-400">−</span>
                <div>
                  <div className="text-xs text-slate-500">Giá vốn</div>
                  <b>{profit.cogs_text}</b>
                </div>
              </div>
              <div className="mt-2 text-center text-xs text-slate-400">Ước tính theo giá vốn nhập hàng — hàng chưa nhập giá vốn không được tính.</div>
            </>
          ) : (
            <div className="py-6 text-center text-slate-500">Chỉ chủ cửa hàng xem được lãi lỗ (liên quan giá vốn).</div>
          )}
        </div>
      )}

      {/* ── KHO HÀNG ── inventory value lives on the owner-gated /pos/inventory; link out (no cost leak) */}
      {reportTab === "stock" && (
        <div className="rounded-xl bg-white p-4">
          <div className="text-slate-600">Tổng quan kho: giá trị tồn (theo giá vốn), số mã hàng, và tồn từng sản phẩm.</div>
          <button onClick={() => router.push("/pos/inventory")} className="mt-3 min-h-touch w-full rounded-xl bg-teal-700 font-extrabold text-white">🏬 Mở Kho hàng</button>
          <button onClick={() => router.push("/pos/low-stock")} className="mt-2 min-h-touch w-full rounded-xl border-2 border-amber-200 bg-white font-bold text-amber-700">📦 Hàng sắp hết</button>
        </div>
      )}

      {/* ── THU CHI ── money-in by method (payment_split) + link to the detailed cash book */}
      {reportTab === "cashflow" && (
        <div className="rounded-xl bg-white p-4">
          {!ready ? (
            <div className="text-center text-slate-500">Chọn khoảng thời gian để xem.</div>
          ) : split ? (
            <>
              <div className="mb-1 font-bold text-slate-700">💰 Tiền vào theo hình thức{s ? ` · ${s.period_label}` : ""}</div>
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
              <button onClick={() => router.push("/pos/cashbook")} className="mt-3 min-h-touch w-full rounded-xl bg-blue-700 font-extrabold text-white">🧮 Sổ quỹ chi tiết (thu / chi / chốt ca)</button>
            </>
          ) : (
            <SkeletonRows rows={3} thumb={false} />
          )}
        </div>
      )}
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
      <BackBar onBack={() => goBackSmart(router)} title="⏰ Lô sắp hết hạn (60 ngày)" />
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
