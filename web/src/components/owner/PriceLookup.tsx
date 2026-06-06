"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import type { Product } from "@/lib/types";
import { BackBar, goBackSmart, ProductPicker, Warn } from "./Shared";

export function PriceLookup() {
  const router = useRouter();
  const [p, setP] = useState<Product | null>(null);

  if (p) {
    return (
      <div>
        <BackBar onBack={() => setP(null)} label="Quay lại" />
        <div className="rounded-xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.image && <img src={p.image} alt="" className="max-h-60 w-full rounded-lg bg-slate-100 object-contain" />}
          <h2 className="mt-2 text-xl font-bold">{p.display_name}</h2>
          <div className="text-3xl font-extrabold text-brand">{p.price_text}</div>
          <div className="mt-1 text-slate-500">
            Tồn: {p.stock_status || "-"} ({p.actual_stock_qty ?? 0}) · Vị trí: {p.shelf_location || "-"}
          </div>
          {p.expiry_text && <div className="mt-1 text-slate-500">HSD gần nhất: {p.expiry_text}</div>}
          {p.safety_notes && <Warn>⚠️ {p.safety_notes}</Warn>}
          <button
            onClick={() => router.push(`/pos/products/${encodeURIComponent(p.item_code)}/edit`)}
            className="mt-3 min-h-touch w-full rounded-xl bg-amber-500 font-extrabold text-white"
          >
            ✏️ Sửa sản phẩm này
          </button>
        </div>
      </div>
    );
  }
  return (
    <ProductPicker
      title="TRA GIÁ"
      accent
      onBack={() => goBackSmart(router)}
      onPick={async (code) => {
        const d = await frappeCall<Product>("cago.api.owner.get_product", { item_code: code }, { method: "GET" });
        setP(d);
      }}
    />
  );
}

export function EditPicker() {
  const router = useRouter();
  return (
    <ProductPicker
      title="SỬA SẢN PHẨM"
      onBack={() => goBackSmart(router)}
      onPick={(code) => router.push(`/pos/products/${encodeURIComponent(code)}/edit`)}
    />
  );
}
