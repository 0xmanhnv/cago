"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { goBackSmart } from "@/components/owner/Shared";
import type { Product, Batch } from "@/lib/types";

import { PageLoading } from "@/components/ui/Loading";
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-2">
      <span className="text-slate-500">{k}</span>
      <b className="text-right">{v}</b>
    </div>
  );
}

// Per-lô list for lot-tracked products: which lô to sell first (FEFO) + its HSD, so staff push
// the soon-to-expire goods. Only in-stock lots; the earliest non-expired is flagged "Bán trước".
function LotList({ code }: { code: string }) {
  const [lots, setLots] = useState<Batch[] | null>(null);
  useEffect(() => {
    frappeCall<Batch[]>("cago.api.inventory.list_batches", { item_code: code }, { method: "GET" })
      .then(setLots)
      .catch(() => setLots([]));
  }, [code]);
  // Only lots that still have stock (sold-out lots are hidden).
  const shown = (lots || []).filter((b) => (b.qty ?? 0) > 0);
  if (!shown.length) return null;
  return (
    <div className="mt-3.5">
      <div className="font-bold">Lô hàng còn <span className="font-normal text-slate-400">(bán lô gần hết hạn trước)</span></div>
      <div className="mt-1 space-y-1">
        {shown.map((b) => (
          <div key={b.batch_id} className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${b.sell_first ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}>
            <span className="min-w-0 truncate font-bold">{b.batch_id}{b.sell_first ? " · 👉 Bán trước" : ""}</span>
            <span className={`shrink-0 ${b.expiry_status === "expired" ? "font-bold text-red-600" : b.expiry_status === "near" ? "font-bold text-amber-700" : "text-slate-500"}`}>
              {b.expiry_text ? `HSD ${b.expiry_text}` : "—"}{(b.qty ?? 0) > 0 ? ` · còn ${b.qty}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// The product's full info card (image + name + price + details + advice + alternatives + safety).
// Shared by the full detail page and the staff sell-screen preview modal so they never diverge.
export function ProductInfo({ p }: { p: Product }) {
  const alts = p.alternatives || {};
  const altBlock = (label: string, arr?: { display_name: string; note?: string }[]) =>
    arr && arr.length ? (
      <div>
        <div className="mt-3.5 font-bold">{label}</div>
        {arr.map((a, i) => (
          <div key={i} className="my-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
            <b>{a.display_name}</b>
            {a.note ? ` — ${a.note}` : ""}
          </div>
        ))}
      </div>
    ) : null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {p.image && <img src={p.image} alt="" className="max-h-60 w-full rounded-lg bg-slate-100 object-contain" />}
      <h2 className="mt-2 text-xl font-bold">{p.display_name}</h2>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {p.best_seller && <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-sm font-bold text-rose-700">🏆 Bán chạy</span>}
        {p.recommended && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">⭐ Khuyên dùng</span>}
      </div>
      <div className="mt-1 text-3xl font-extrabold text-brand">{p.price_text}</div>
      {p.sale_units && p.sale_units.length > 1 && (
        <div className="mt-1 text-slate-600">
          Giá bán lẻ: <b>{p.sale_units.slice(1).map((u) => u.price_text).join(" · ")}</b>
        </div>
      )}
      <Row k="Tồn kho" v={`${p.stock_status || "-"} (${p.actual_stock_qty ?? 0})`} />
      <Row k="Vị trí để hàng" v={p.shelf_location || "-"} />
      <Row k="Tên hay gọi" v={p.local_names || "-"} />
      <Row k="Dùng cho" v={p.use_cases || "-"} />
      {p.expiry_text && (
        <Row
          k="Hạn sử dụng"
          v={`${p.expiry_text}${p.expiry_status === "expired" ? " (đã hết hạn)" : p.expiry_status === "near" ? " (sắp hết hạn)" : ""}`}
        />
      )}
      {p.has_batch && <LotList code={p.item_code} />}
      {p.staff_advice && (
        <>
          <div className="mt-3.5 font-bold">Tư vấn</div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">{p.staff_advice}</div>
        </>
      )}
      {altBlock("Rẻ hơn", alts.cheaper)}
      {altBlock("Tương đương", alts.equivalent)}
      {altBlock("Tốt hơn", alts.better)}
      {altBlock("Tránh dùng cùng", alts.avoid)}
      {p.call_owner_when && (
        <div className="mt-3 rounded-lg border border-red-400 bg-red-100 p-3 text-red-900">📞 Gọi chủ khi: {p.call_owner_when}</div>
      )}
      {p.safety_notes && (
        <div className="mt-3 rounded-lg border border-amber-400 bg-amber-100 p-3 text-amber-900">⚠️ {p.safety_notes}</div>
      )}
    </>
  );
}

export function ProductDetail({ code }: { code: string }) {
  const router = useRouter();
  const [p, setP] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    frappeCall<Product>("cago.api.staff.get_product", { item_code: code }, { method: "GET" })
      .then(setP)
      .catch(() => setP(null))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) return <PageLoading />;
  if (!p)
    return (
      <div className="rounded-xl border border-amber-400 bg-amber-100 p-4 text-amber-900">
        Không tải được sản phẩm.{" "}
        <button onClick={() => goBackSmart(router, "/pos/search")} className="underline">
          Quay lại
        </button>
      </div>
    );

  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2.5">
        <button onClick={() => goBackSmart(router, "/pos/search")} className="shrink-0 whitespace-nowrap rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ‹ Quay lại
        </button>
      </div>
      <div className="rounded-xl bg-white p-4">
        <ProductInfo p={p} />
      </div>
    </div>
  );
}
