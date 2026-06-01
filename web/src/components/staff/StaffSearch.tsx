"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { alertDialog } from "@/components/ui/dialog";
import { CatThumb } from "@/components/kiosk/CatThumb";
import type { ProductCard } from "@/lib/types";

const PAGE = 30;

export function StaffSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [list, setList] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const run = async (query: string) => {
    setLoading(true);
    try {
      const r = (await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query, start: 0 }, { method: "GET" })) || [];
      setList(r);
      setHasMore(r.length >= PAGE);
    } finally {
      setLoading(false);
    }
  };
  const loadMore = async () => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const r = (await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query: q.trim(), start: list.length }, { method: "GET" })) || [];
      setList((prev) => [...prev, ...r]);
      setHasMore(r.length >= PAGE);
    } finally {
      setLoadingMore(false);
    }
  };
  useEffect(() => {
    void run("");
  }, []);
  // Auto load-more when the bottom sentinel scrolls into view.
  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es[0]?.isIntersecting && void loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, loadingMore, list.length, q]);

  const findBarcode = async (code: string) => {
    if (!code.trim()) return;
    const r = await frappeCall<{ item_code: string | null }>(
      "cago.api.catalog.find_by_barcode",
      { barcode: code.trim() },
      { method: "GET" },
    );
    if (r.item_code) router.push(`/staff/products/${encodeURIComponent(r.item_code)}`);
    else await alertDialog("Không tìm thấy sản phẩm với mã vạch này.");
  };

  return (
    <div>
      {/* Top row: back + the rarely-typed barcode field (scanned, short). */}
      <div className="mb-2.5 flex items-center gap-2.5">
        <button onClick={() => router.push("/staff")} className="shrink-0 whitespace-nowrap rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ← Trang chủ
        </button>
        <input
          placeholder="⌨ Quét mã vạch..."
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void findBarcode((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = "";
            }
          }}
          className="min-w-0 flex-1 rounded-xl border-2 border-emerald-300 p-3 text-base"
        />
      </div>
      {/* The frequently-used name search gets a full-width, larger input. */}
      <input
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          clearTimeout(tRef.current);
          tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
        }}
        placeholder="🔎 Tìm theo tên, tên hay gọi, màu, công dụng..."
        className="mb-3.5 w-full rounded-xl border-2 border-slate-300 p-3.5 text-lg"
      />
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : list.length === 0 ? (
        <div className="text-slate-500">Không tìm thấy.</div>
      ) : (
        <>
          {list.map((p) => (
            <button
              key={p.item_code}
              onClick={() => router.push(`/staff/products/${encodeURIComponent(p.item_code)}`)}
              className="mb-3 flex w-full items-center gap-3 rounded-xl bg-white p-3.5 text-left shadow"
            >
              <div className="h-[64px] w-[64px] shrink-0 overflow-hidden rounded-lg">
                <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="thumb" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold leading-tight">{p.display_name}</div>
                <div className="font-bold text-brand">{p.price_text}</div>
                <div className="text-slate-500">
                  {p.stock_status} {p.category ? `· ${p.category}` : ""}
                </div>
              </div>
            </button>
          ))}
          {hasMore && <div ref={sentinelRef} className="h-1" />}
          {loadingMore && <div className="py-4 text-center text-slate-400">Đang tải thêm...</div>}
        </>
      )}
    </div>
  );
}
