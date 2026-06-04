"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar, goBackSmart } from "./OwnerShared";

import { PageLoading } from "@/components/ui/Loading";
interface StockRow {
  item_code: string;
  display_name: string;
  status: string;
  shelf_location?: string;
  qty?: string | null;
}
interface ExpiryRow {
  item_code: string;
  display_name: string;
  expiry_text: string;
  days_left: number | null;
  qty: number;
}
interface DebtRow {
  customer: string;
  slug: string;
  customer_name: string;
  outstanding_text: string;
  limit_text: string;
}
interface Alerts {
  out_of_stock: StockRow[];
  low_stock: StockRow[];
  expiring: ExpiryRow[];
  over_limit: DebtRow[];
}

function Section({ title, tint, children, count }: { title: string; tint: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <div className={`mb-3 rounded-2xl border-l-4 bg-white p-3.5 shadow-sm ${tint}`}>
      <div className="mb-1.5 font-extrabold">{title} ({count})</div>
      {/* two columns on a wide PC so the alert rows fill the width instead of one long column */}
      <div className="xl:grid xl:grid-cols-2 xl:gap-x-5">{children}</div>
    </div>
  );
}

export function TodayAlerts() {
  const router = useRouter();
  const [a, setA] = useState<Alerts | null>(null);

  useEffect(() => {
    frappeCall<Alerts>("cago.api.alerts.today_alerts", {}, { method: "GET" })
      .then(setA)
      .catch(() => setA({ out_of_stock: [], low_stock: [], expiring: [], over_limit: [] }));
  }, []);

  if (!a) return <PageLoading />;
  const empty = !a.out_of_stock.length && !a.low_stock.length && !a.expiring.length && !a.over_limit.length;

  const StockItem = ({ r }: { r: StockRow }) => (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
      <div className="min-w-0">
        <div className="truncate font-bold">{r.display_name}</div>
        <div className="text-sm text-slate-500">{r.qty ? `Còn ${r.qty}` : r.status}{r.shelf_location ? ` · kệ ${r.shelf_location}` : ""}</div>
      </div>
      <button onClick={() => router.push("/pos/reorder")} className="shrink-0 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-bold text-white">Nhập</button>
    </div>
  );

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="🔔 Cảnh báo hôm nay" />
      {empty ? (
        <div className="rounded-2xl border-2 border-emerald-100 bg-white p-8 text-center text-slate-500">
          <div className="text-5xl">✅</div>
          <div className="mt-2 font-bold text-brand-dark">Không có cảnh báo nào hôm nay.</div>
        </div>
      ) : (
        <>
          <Section title="🔴 Đang hết hàng — không bán được" tint="border-l-red-500" count={a.out_of_stock.length}>
            {a.out_of_stock.map((r) => <StockItem key={r.item_code} r={r} />)}
          </Section>
          <Section title="🟠 Sắp hết — nên nhập thêm" tint="border-l-amber-400" count={a.low_stock.length}>
            {a.low_stock.map((r) => <StockItem key={r.item_code} r={r} />)}
          </Section>
          <Section title="⏰ Sắp / đã hết hạn" tint="border-l-orange-500" count={a.expiring.length}>
            {a.expiring.map((r) => (
              <button key={`${r.item_code}-${r.expiry_text}`} onClick={() => router.push("/pos/expiry")} className="flex w-full items-center justify-between border-b border-slate-100 py-2 text-left last:border-0">
                <div className="min-w-0">
                  <div className="truncate font-bold">{r.display_name}</div>
                  <div className="text-sm text-slate-500">HSD {r.expiry_text} · còn {r.qty}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${r.days_left !== null && r.days_left < 0 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                  {r.days_left !== null ? (r.days_left < 0 ? "Đã hết hạn" : `Còn ${r.days_left} ngày`) : "—"}
                </span>
              </button>
            ))}
          </Section>
          <Section title="📒 Khách nợ vượt hạn mức" tint="border-l-rose-500" count={a.over_limit.length}>
            {a.over_limit.map((r) => (
              <button key={r.customer} onClick={() => router.push(`/pos/debt/${r.slug}`)} className="flex w-full items-center justify-between border-b border-slate-100 py-2 text-left last:border-0">
                <div className="min-w-0">
                  <div className="truncate font-bold">{r.customer_name}</div>
                  <div className="text-sm text-slate-500">Hạn mức {r.limit_text}</div>
                </div>
                <b className="shrink-0 text-red-600">{r.outstanding_text}</b>
              </button>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
