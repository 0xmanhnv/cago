"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import type { Product } from "@/lib/types";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-2">
      <span className="text-slate-500">{k}</span>
      <b className="text-right">{v}</b>
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
      <div className="text-3xl font-extrabold text-brand">{p.price_text}</div>
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

export function StaffProductDetail({ code }: { code: string }) {
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

  if (loading) return <div className="py-8 text-center text-slate-500">Đang tải...</div>;
  if (!p)
    return (
      <div className="rounded-xl border border-amber-400 bg-amber-100 p-4 text-amber-900">
        Không tải được sản phẩm.{" "}
        <button onClick={() => router.push("/staff/search")} className="underline">
          Quay lại
        </button>
      </div>
    );

  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2.5">
        <button onClick={() => router.push("/staff/search")} className="shrink-0 whitespace-nowrap rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ‹ Quay lại
        </button>
      </div>
      <div className="rounded-xl bg-white p-4">
        <ProductInfo p={p} />
      </div>
    </div>
  );
}
