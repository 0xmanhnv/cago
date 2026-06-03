"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { CatThumb } from "@/components/kiosk/CatThumb";
import { SearchInput } from "@/components/ui/ListUI";
import { SkeletonRows } from "@/components/ui/Skeleton";
import type { ProductCard } from "@/lib/types";
import { BackBar, goBackSmart } from "./OwnerShared";

// One product hub: search to look up a price (tra giá) → tap to edit (sửa), ➕ to add (thêm) —
// the three old separate screens. Related product tools live here as quick links instead of
// scattered home tiles.
const LINKS = [
  { href: "/pos/recommended", label: "⭐ Hàng khuyên dùng" },
  { href: "/pos/labels", label: "🏷 In tem giá" },
  { href: "/pos/categories", label: "🗂 Loại hàng" },
  { href: "/pos/health", label: "🩺 Kiểm tra dữ liệu" },
];

export function ProductManager() {
  const router = useRouter();
  const [list, setList] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = async (query: string) => {
    setLoading(true);
    try {
      setList((await frappeCall<ProductCard[]>("cago.api.owner.search_products", { query }, { method: "GET" })) || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load("");
  }, []);
  const onSearch = (v: string) => {
    setQ(v);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => load(v.trim()), 300);
  };
  const edit = (code: string) => router.push(`/pos/products/${encodeURIComponent(code)}/edit`);

  return (
    <div className="mx-auto max-w-[820px]">
      <BackBar onBack={() => goBackSmart(router)} title="📦 SẢN PHẨM" />
      <button onClick={() => router.push("/pos/products/new")} className="mt-tile mb-3 min-h-[60px] w-full bg-teal-600 text-lg">
        ➕ Thêm sản phẩm mới
      </button>
      <SearchInput value={q} onChange={onSearch} placeholder="🔎 Tìm để xem giá / sửa..." />
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
        {LINKS.map((l) => (
          <button key={l.href} onClick={() => router.push(l.href)} className="flex-none whitespace-nowrap rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-bold text-slate-700">
            {l.label}
          </button>
        ))}
      </div>
      {loading ? (
        <SkeletonRows rows={6} />
      ) : list.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tìm thấy sản phẩm.</div>
      ) : (
        <div className="xl:grid xl:grid-cols-2 xl:gap-x-3">
          {list.map((p) => (
            <button key={p.item_code} onClick={() => edit(p.item_code)} className="mb-2 flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left shadow">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="thumb" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold leading-tight">{p.recommended && <span title="Khuyên dùng">⭐ </span>}{p.display_name}</div>
                <div className="font-bold text-brand">{p.price_text}</div>
                <div className="text-sm text-slate-500">{p.stock_status}</div>
              </div>
              <span className="shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-white">Sửa →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
