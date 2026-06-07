"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { CatThumb } from "@/components/kiosk/CatThumb";
import { SearchInput } from "@/components/ui/ListUI";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/toast";
import type { ProductCard } from "@/lib/types";
import { BackBar, goBackSmart } from "./Shared";
import { SectionTabs } from "@/components/pos/SectionTabs";

/**
 * Bulk-manage "⭐ khuyên dùng" flags: one tappable star per product, saved instantly (no
 * select-then-save step — easier for a non-technical owner). Filter to "only recommended" to review.
 */
export function RecommendedManager() {
  const router = useRouter();
  const [list, setList] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [recoOnly, setRecoOnly] = useState(false);
  const [busy, setBusy] = useState("");
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = async (query: string, reco: boolean) => {
    setLoading(true);
    try {
      setList((await frappeCall<ProductCard[]>("cago.api.owner.search_products", { query, recommended_only: reco ? 1 : 0 }, { method: "GET" })) || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load("", false);
  }, []);

  const onSearch = (v: string) => {
    setQ(v);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => load(v.trim(), recoOnly), 300);
  };
  const toggleRecoOnly = () => {
    const v = !recoOnly;
    setRecoOnly(v);
    void load(q.trim(), v);
  };

  const toggle = async (p: ProductCard) => {
    if (busy) return;
    setBusy(p.item_code);
    const next = !p.recommended;
    try {
      await frappeCall("cago.api.owner.set_recommended", { item_code: p.item_code, on: next ? 1 : 0 });
      // Update the row; if filtering to "only recommended", drop a row we just turned off.
      setList((prev) =>
        prev
          .map((x) => (x.item_code === p.item_code ? { ...x, recommended: next } : x))
          .filter((x) => !recoOnly || x.recommended),
      );
      toast.success(next ? `Đã khuyên dùng: ${p.display_name}` : `Bỏ khuyên dùng: ${p.display_name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi: không lưu được.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="⭐ HÀNG KHUYÊN DÙNG" />
      <SectionTabs group="products" />
      <p className="mb-2 text-sm text-slate-500">
        Bấm ⭐ để bật/tắt (lưu ngay). Hàng khuyên dùng được trợ lý ưu tiên gợi ý và hiện ⭐ trên thẻ sản phẩm.
      </p>
      <SearchInput value={q} onChange={onSearch} placeholder="🔎 Tìm sản phẩm..." />
      <div className="mb-2.5">
        <button
          onClick={toggleRecoOnly}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-bold ${recoOnly ? "border-amber-400 bg-amber-100 text-amber-800" : "border-slate-300 bg-white text-slate-600"}`}
        >
          Chỉ xem hàng đang khuyên dùng{recoOnly ? " ✓" : ""}
        </button>
      </div>
      {loading ? (
        <SkeletonRows rows={6} />
      ) : list.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">{recoOnly ? "Chưa có hàng nào được khuyên dùng." : "Không tìm thấy sản phẩm."}</div>
      ) : (
        <div className="xl:grid xl:grid-cols-2 xl:gap-x-3">
          {list.map((p) => (
            <div key={p.item_code} className="mb-2 flex items-center gap-3 rounded-xl bg-white p-3 shadow">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="thumb" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold leading-tight">{p.display_name}</div>
                <div className="text-sm font-bold text-brand">{p.price_text}</div>
              </div>
              <button
                onClick={() => toggle(p)}
                disabled={busy === p.item_code}
                className={`shrink-0 rounded-xl px-4 py-2.5 font-bold disabled:opacity-50 ${p.recommended ? "bg-amber-400 text-white" : "bg-slate-100 text-slate-500"}`}
              >
                {busy === p.item_code ? "..." : p.recommended ? "⭐ Đang khuyên" : "☆ Khuyên dùng"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
