"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { CatThumb } from "@/components/kiosk/CatThumb";
import { CategoryNav } from "@/components/ui/CategoryNav";
import { SkeletonRows } from "@/components/ui/Skeleton";
import type { ProductCard, Category } from "@/lib/types";

const PAGE = 30;

export function Search() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [list, setList] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "card">("list"); // dense list by default (fast lookup)
  const [cats, setCats] = useState<Category[]>([]);
  const [category, setCategory] = useState(""); // active category filter ("" = all)
  const [recoOnly, setRecoOnly] = useState(false); // ⭐ show only "khuyên dùng"
  const recoRef = useRef(false); // current value for the async load callbacks (avoids stale closure)
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0); // ignore out-of-order search responses (newest wins)

  // Persist the list/card choice (own key — lookup vs the sell screen are different contexts).
  useEffect(() => {
    const v = window.localStorage?.getItem("cago_search_view");
    if (v === "list" || v === "card") setViewMode(v);
  }, []);
  const chooseView = (v: "list" | "card") => {
    setViewMode(v);
    window.localStorage?.setItem("cago_search_view", v);
  };

  const run = async (query: string, cat = category) => {
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const r = (await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query, category: cat || null, start: 0, recommended_only: recoRef.current ? 1 : 0 }, { method: "GET" })) || [];
      if (seq !== seqRef.current) return;
      setList(r);
      setHasMore(r.length >= PAGE);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };
  const loadMore = async () => {
    if (loadingMore || loading) return;
    const seq = seqRef.current;
    setLoadingMore(true);
    try {
      const r = (await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query: q.trim(), category: category || null, start: list.length, recommended_only: recoRef.current ? 1 : 0 }, { method: "GET" })) || [];
      if (seq !== seqRef.current) return;
      setList((prev) => [...prev, ...r]);
      setHasMore(r.length >= PAGE);
    } finally {
      setLoadingMore(false);
    }
  };
  const pickCategory = (c: string) => {
    setCategory(c);
    void run(q.trim(), c);
  };
  const toggleReco = () => {
    const v = !recoOnly;
    setRecoOnly(v);
    recoRef.current = v;
    void run(q.trim());
  };
  useEffect(() => {
    void run("");
    frappeCall<Category[]>("cago.api.staff.list_categories", {}, { method: "GET" }).then((d) => setCats(d || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (r.item_code) router.push(`/pos/products/${encodeURIComponent(r.item_code)}`);
    else toast.info("Không tìm thấy sản phẩm với mã vạch này.");
  };

  return (
    <div>
      {/* Top row: back + the primary name search (the most-used field, so it gets top spot
          and the biggest input). The barcode field is secondary (below). */}
      <div className="mb-2.5 flex items-center gap-2.5">
        <button onClick={() => router.push("/pos")} className="shrink-0 whitespace-nowrap rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ‹ Trang chủ
        </button>
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            clearTimeout(tRef.current);
            tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
          }}
          enterKeyHint="search" placeholder="🔎 Tìm theo tên, tên hay gọi, màu, công dụng..."
          className="min-w-0 flex-1 rounded-xl border-2 border-slate-300 p-3.5 text-lg"
        />
      </div>
      {/* Barcode is rarely typed by hand (a scanner fires keystrokes + Enter), so it stays a
          slim, muted secondary field rather than competing with the name search. */}
      <input
        placeholder="⌨ Hoặc quét mã vạch..."
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            void findBarcode((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = "";
          }
        }}
        className="mb-2.5 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm"
      />
      {/* ⭐ "recommended only" filter — show just the items the owner flagged as khuyên dùng. */}
      <div className="mb-2.5">
        <button
          onClick={toggleReco}
          className={`rounded-full border px-3.5 py-1.5 text-sm font-bold ${recoOnly ? "border-amber-400 bg-amber-100 text-amber-800" : "border-slate-300 bg-white text-slate-600"}`}
        >
          ⭐ Chỉ hàng khuyên dùng{recoOnly ? " ✓" : ""}
        </button>
      </div>
      {/* Category quick-filter — browse a whole group without typing (same control as the sell screen). */}
      {cats.length > 0 && (
        <div className="mb-3">
          <CategoryNav variant="chips" cats={cats} active={category} onPick={pickCategory} />
        </div>
      )}
      {/* Result count + list/card toggle (same control as the sell screen, for consistency). */}
      {!loading && list.length > 0 && (
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-sm text-slate-400">{list.length} sản phẩm{hasMore ? "+" : ""}</span>
          <div className="flex shrink-0 overflow-hidden rounded-full border border-slate-300 bg-white">
            <button onClick={() => chooseView("list")} aria-label="Dạng danh sách" className={`px-3 py-1.5 text-lg ${viewMode === "list" ? "bg-brand text-white" : "text-slate-600"}`}>☰</button>
            <button onClick={() => chooseView("card")} aria-label="Dạng thẻ" className={`px-3 py-1.5 text-lg ${viewMode === "card" ? "bg-brand text-white" : "text-slate-600"}`}>▦</button>
          </div>
        </div>
      )}
      {loading ? (
        <SkeletonRows rows={6} />
      ) : list.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tìm thấy. Thử gõ tên khác.</div>
      ) : (
        <>
          {/* list = dense rows (2 columns on a wide PC so they don't stretch empty);
              card = thumbnail grid that adds columns to fill a big in-store screen. */}
          <div
            className={`grid gap-3 ${
              viewMode === "list"
                ? "grid-cols-1 xl:grid-cols-2 xl:gap-x-3"
                : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
            }`}
          >
            {list.map((p) =>
              viewMode === "card" ? (
                <button
                  key={p.item_code}
                  onClick={() => router.push(`/pos/products/${encodeURIComponent(p.item_code)}`)}
                  className="flex h-full flex-col overflow-hidden rounded-xl bg-white text-left shadow transition hover:-translate-y-0.5 hover:shadow-card"
                >
                  <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="grid" />
                  <div className="flex flex-1 flex-col p-2.5">
                    <div className="line-clamp-2 min-h-[2.5em] font-bold leading-tight">
                      {p.best_seller && <span title="Bán chạy">🏆 </span>}{p.recommended && <span title="Khuyên dùng">⭐ </span>}
                      {p.display_name}
                    </div>
                    <div className="mt-0.5 font-bold text-brand">{p.price_text}</div>
                    <div className="mt-auto pt-1 text-sm text-slate-500">
                      {[p.stock_status, p.category].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </button>
              ) : (
                <button
                  key={p.item_code}
                  onClick={() => router.push(`/pos/products/${encodeURIComponent(p.item_code)}`)}
                  className="flex w-full items-center gap-3 rounded-xl bg-white p-3.5 text-left shadow"
                >
                  <div className="h-[64px] w-[64px] shrink-0 overflow-hidden rounded-lg">
                    <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="thumb" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold leading-tight">
                      {p.best_seller && <span title="Bán chạy">🏆 </span>}{p.recommended && <span title="Khuyên dùng">⭐ </span>}
                      {p.display_name}
                    </div>
                    <div className="font-bold text-brand">{p.price_text}</div>
                    <div className="text-slate-500">
                      {[p.stock_status, p.category].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </button>
              ),
            )}
          </div>
          {hasMore && <div ref={sentinelRef} className="h-1" />}
          {loadingMore && <div className="py-4 text-center text-slate-400">Đang tải thêm...</div>}
        </>
      )}
    </div>
  );
}
