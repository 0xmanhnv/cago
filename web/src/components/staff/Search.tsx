"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { CatThumb } from "@/components/kiosk/CatThumb";
import { CategoryNav } from "@/components/ui/CategoryNav";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { BarcodeScanner } from "@/components/ui/BarcodeScanner";
import { SearchHeader, StockBadge } from "@/components/owner/Shared";
import type { ProductCard, Category } from "@/lib/types";

const PAGE = 30;

export function Search() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  // Filters live in the URL so they survive opening a product and pressing Back: the screen
  // re-mounts fresh on back, but the URL (and these params) is restored.
  const [q, setQ] = useState(() => sp.get("q") || "");
  const [list, setList] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "card">(() => {
    const v = sp.get("view");
    return v === "card" || v === "list" ? v : "list";
  });
  const [cats, setCats] = useState<Category[]>([]);
  const [camOpen, setCamOpen] = useState(false); // camera barcode scanner overlay
  const [category, setCategory] = useState(() => sp.get("cat") || ""); // active category filter ("" = all)
  const [recoOnly, setRecoOnly] = useState(() => sp.get("reco") === "1"); // ⭐ show only "khuyên dùng"
  const recoRef = useRef(sp.get("reco") === "1"); // current value for the async load callbacks (avoids stale closure)
  // Write the current filters to the URL (replace = no history spam) so Back restores them.
  const syncUrl = (next: { q?: string; category?: string; recoOnly?: boolean; viewMode?: "list" | "card" }) => {
    const p = new URLSearchParams();
    const qq = (next.q ?? q).trim();
    const cc = next.category ?? category;
    const rr = next.recoOnly ?? recoOnly;
    const vv = next.viewMode ?? viewMode;
    if (qq) p.set("q", qq);
    if (cc) p.set("cat", cc);
    if (rr) p.set("reco", "1");
    if (vv !== "list") p.set("view", vv);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0); // ignore out-of-order search responses (newest wins)

  // Persist the list/card choice (own key — lookup vs the sell screen are different contexts).
  useEffect(() => {
    if (sp.get("view")) return; // a view in the URL wins over the saved preference
    const v = window.localStorage?.getItem("cago_search_view");
    if (v === "list" || v === "card") setViewMode(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const chooseView = (v: "list" | "card") => {
    setViewMode(v);
    window.localStorage?.setItem("cago_search_view", v);
    syncUrl({ viewMode: v });
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
    syncUrl({ category: c });
    void run(q.trim(), c);
  };
  const toggleReco = () => {
    const v = !recoOnly;
    setRecoOnly(v);
    recoRef.current = v;
    syncUrl({ recoOnly: v });
    void run(q.trim());
  };
  useEffect(() => {
    void run(q.trim(), category);
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
      {/* Shared green app-bar (same as Tra giá): name search + barcode + camera fold into the headroom
          header, so this screen matches the rest and keeps the status bar green. */}
      <SearchHeader
        title="Tìm hàng"
        onBack={() => router.push("/pos")}
        searchValue={q}
        onSearch={(e) => {
          const v = e.target.value;
          setQ(v);
          clearTimeout(tRef.current);
          tRef.current = setTimeout(() => { void run(v.trim()); syncUrl({ q: v }); }, 250);
        }}
        searchPlaceholder="🔎 Tìm theo tên, tên hay gọi, màu, công dụng..."
        onBarcodeKey={(e) => {
          if (e.key === "Enter") {
            clearTimeout(tRef.current); // cancel the pending text-search for the typed barcode digits
            void findBarcode((e.target as HTMLInputElement).value);
            setQ(""); // controlled input → clear via state (DOM .value="" wouldn't stick)
          }
        }}
        onCam={() => setCamOpen(true)}
      />
      {camOpen && (
        <BarcodeScanner
          onScan={(c) => {
            setCamOpen(false);
            void findBarcode(c);
          }}
          onClose={() => setCamOpen(false)}
        />
      )}
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
                    <div className="mt-0.5 text-lg font-extrabold text-brand">{p.price_text}</div>
                    <div className="mt-auto flex flex-wrap items-center gap-x-1.5 pt-1">
                      <StockBadge status={p.stock_status} />
                      {p.category && <span className="text-sm text-slate-400">· {p.category}</span>}
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
                    <div className="text-base font-extrabold text-brand">{p.price_text}</div>
                    <div className="flex flex-wrap items-center gap-x-1.5">
                      <StockBadge status={p.stock_status} />
                      {p.category && <span className="text-sm text-slate-400">· {p.category}</span>}
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
