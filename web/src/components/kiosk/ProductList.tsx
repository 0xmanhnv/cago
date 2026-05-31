"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { useKiosk } from "@/store/kiosk";
import { useKioskNav } from "@/lib/kioskNav";
import { CatThumb } from "./CatThumb";
import type { ProductCard } from "@/lib/types";

type Sort = "default" | "price_asc" | "price_desc";

function priceNum(p: ProductCard) {
  const digits = (p.price_text || "").replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : Number.MAX_SAFE_INTEGER; // "Liên hệ" sorts last
}
const inStock = (p: ProductCard) => (p.stock_status || "").includes("Còn");

export function ProductList() {
  const router = useRouter();
  const sp = useSearchParams();
  const nav = useKioskNav();
  const kiosk = useKiosk();

  const category = sp.get("category") || "";
  const q = sp.get("q") || "";
  const sort = (sp.get("sort") as Sort) || "default";
  const stockOnly = sp.get("stock") === "1";

  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [qInput, setQInput] = useState(q);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // assistant focus follows the category being browsed
  useEffect(() => {
    kiosk.setFocusCategory(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // fetch when category or search term (from the URL) changes
  useEffect(() => {
    setLoading(true);
    frappeCall<ProductCard[]>(
      "cago.api.kiosk.list_products",
      { category: category || null, query: q || null },
      { method: "GET" },
    )
      .then((r) => setProducts(r || []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [category, q]);

  // keep the input in sync when the URL changes (e.g. browser Back)
  useEffect(() => setQInput(q), [q]);

  // filters/sort live in the URL too (so reload + share keep them) — replace, don't push
  const setParams = (partial: Record<string, string | undefined>) => {
    const usp = new URLSearchParams(sp.toString());
    Object.entries(partial).forEach(([k, v]) => (v ? usp.set(k, v) : usp.delete(k)));
    const s = usp.toString();
    router.replace(s ? `/products?${s}` : "/products");
  };
  const onSearch = (val: string) => {
    setQInput(val);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setParams({ q: val.trim() || undefined }), 300);
  };

  const view = useMemo(() => {
    let arr = products;
    if (stockOnly) arr = arr.filter(inStock);
    if (sort === "price_asc") arr = [...arr].sort((a, b) => priceNum(a) - priceNum(b));
    else if (sort === "price_desc") arr = [...arr].sort((a, b) => priceNum(b) - priceNum(a));
    return arr;
  }, [products, sort, stockOnly]);

  const title = category || (q.trim() ? `Tìm: ${q.trim()}` : "Tất cả");
  const chip = (active: boolean) =>
    `flex-none whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-bold ${
      active ? "border-brand bg-brand text-white" : "border-emerald-300 bg-brand-light text-brand-dark"
    }`;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5">
        <button onClick={nav.goHome} className="rounded-xl bg-brand-light px-4 py-3 text-lg font-extrabold text-brand-dark">
          ← Trang chủ
        </button>
        <div className="flex-1 text-[22px] font-bold text-brand-dark">{title}</div>
      </div>

      <input
        value={qInput}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={category ? `Tìm trong ${category}...` : "Tìm sản phẩm..."}
        className="mb-2.5 w-full rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
      />
      <div className="mb-3.5 flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setParams({ stock: stockOnly ? undefined : "1" })} className={chip(stockOnly)}>
          ✅ Còn hàng
        </button>
        <button
          onClick={() => setParams({ sort: sort === "price_asc" ? undefined : "price_asc" })}
          className={chip(sort === "price_asc")}
        >
          ⬆️ Giá thấp
        </button>
        <button
          onClick={() => setParams({ sort: sort === "price_desc" ? undefined : "price_desc" })}
          className={chip(sort === "price_desc")}
        >
          ⬇️ Giá cao
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-500">Đang tải...</div>
      ) : view.length === 0 ? (
        <div className="py-8 text-center text-slate-500">
          {q.trim() || stockOnly ? "Không tìm thấy sản phẩm phù hợp." : "Không có sản phẩm."}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
          {view.map((p) => (
            <button
              key={p.item_code}
              onClick={() => nav.openDetail(p.item_code)}
              className="overflow-hidden rounded-2xl bg-white text-left shadow"
            >
              <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="grid" />
              <div className="p-2.5">
                <div className="text-[17px] font-extrabold">{p.display_name}</div>
                <div className="mt-1 font-extrabold text-brand">{p.price_text}</div>
                <div className="text-sm text-slate-500">{p.stock_status}</div>
                {p.is_chemical && (
                  <span className="mt-1.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                    ⚠️ Hóa chất
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
