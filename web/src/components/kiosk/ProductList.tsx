"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { useKiosk } from "@/store/kiosk";
import { useKioskNav } from "@/lib/kioskNav";
import { CatThumb } from "./CatThumb";
import { NavButtons } from "./NavButtons";
import { PageLoading } from "@/components/ui/Loading";
import { StockBadge } from "@/components/ui/StockBadge";
import type { Category, ProductCard } from "@/lib/types";

type Sort = "default" | "price_asc" | "price_desc";

function priceNum(p: ProductCard): number | null {
  const digits = (p.price_text || "").replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : null; // null = no price ("Liên hệ") → always sorted last
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
  const recoOnly = sp.get("reco") === "1"; // ⭐ show only "khuyên dùng"

  const [products, setProducts] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [qInput, setQInput] = useState(q);
  const [viewMode, setViewMode] = useState<"card" | "list">("card"); // default card; remembered per device
  const [shown, setShown] = useState(30); // incremental render for long catalogs (load-more on scroll)
  const [cats, setCats] = useState<Category[]>([]); // for the category quick-switch nav
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Categories for the side nav / chip strip — lets a customer jump between categories without
  // going back to the home screen.
  useEffect(() => {
    frappeCall<Category[]>("cago.api.kiosk.get_categories", {}, { method: "GET" })
      .then((d) => setCats(d || []))
      .catch(() => {});
  }, []);

  // Hide the controls bar when scrolling DOWN (more room for products), reveal it instantly when
  // scrolling UP (scrolling up signals the customer wants to search / switch category).
  const [hideBar, setHideBar] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const apply = () => {
      ticking = false;
      const y = Math.max(0, window.scrollY);
      // Only react to a deliberate move (>=12px) so content growth / momentum jitter near the
      // load-more boundary doesn't flicker the bar. Always show near the top.
      if (y < 90) setHideBar(false);
      else if (y > last + 12) setHideBar(true);
      else if (y < last - 12) setHideBar(false);
      last = y;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(apply);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const v = window.localStorage?.getItem("cago_kiosk_view");
    if (v === "list" || v === "card") setViewMode(v);
  }, []);
  const chooseView = (v: "card" | "list") => {
    setViewMode(v);
    window.localStorage?.setItem("cago_kiosk_view", v);
  };

  // assistant focus follows the category being browsed
  useEffect(() => {
    kiosk.setFocusCategory(category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // fetch when category or search term (from the URL) changes
  useEffect(() => {
    let active = true; // ignore a stale response if category/q changed before it resolved
    setLoading(true);
    frappeCall<ProductCard[]>(
      "cago.api.kiosk.list_products",
      { category: category || null, query: q || null },
      { method: "GET" },
    )
      .then((r) => { if (active) setProducts(r || []); })
      .catch(() => { if (active) setProducts([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
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

  // In-page category switch (sidebar + chips). Use REPLACE, not push: switching the category chip
  // is filtering the same screen, not a new destination — so it shouldn't pile up history entries
  // (otherwise "Quay lại" would step through every chip the customer tried instead of returning to
  // the screen that opened the list). Keep an explicit (empty) category= so the URL actually
  // changes — pushing/replacing the bare "/products" with a stale ?category= is a no-op in the App
  // Router, which is why "Tất cả" previously did nothing.
  const switchCategory = (c: string) => {
    router.replace(c ? `/products?category=${encodeURIComponent(c)}` : "/products?category=");
  };

  const view = useMemo(() => {
    let arr = products;
    if (stockOnly) arr = arr.filter(inStock);
    if (recoOnly) arr = arr.filter((p) => p.recommended);
    // Price-less items ("Liên hệ") always sort last, in BOTH directions.
    if (sort === "price_asc") arr = [...arr].sort((a, b) => (priceNum(a) ?? Infinity) - (priceNum(b) ?? Infinity));
    else if (sort === "price_desc") arr = [...arr].sort((a, b) => (priceNum(b) ?? -Infinity) - (priceNum(a) ?? -Infinity));
    return arr;
  }, [products, sort, stockOnly, recoOnly]);

  // Reset the visible window whenever the result set changes (new category/search/filter/sort).
  useEffect(() => setShown(30), [category, q, sort, stockOnly, recoOnly]);

  // Auto load-more: when the bottom sentinel scrolls into view and there's more, reveal the next page.
  const visible = view.slice(0, shown);
  const hasMore = view.length > shown;
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && setShown((n) => n + 30),
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, shown, view.length]);

  // `category` is a slug → show the Vietnamese label from the loaded categories.
  const catLabel = (slug: string): string => {
    for (const t of cats) {
      if (t.slug === slug) return t.category;
      const c = (t.children || []).find((x) => x.slug === slug);
      if (c) return c.category;
    }
    return slug;
  };
  const title = category ? catLabel(category) : q.trim() ? `Tìm: ${q.trim()}` : "Tất cả";
  const chip = (active: boolean) =>
    `flex-none whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-bold ${
      active ? "border-brand bg-brand text-white" : "border-emerald-300 bg-brand-light text-brand-dark"
    }`;

  return (
    <div className="lg:flex lg:gap-5">
      {/* Category quick-switch — sidebar on tablet/desktop so customers jump between categories
          without returning to the home screen. (On phones it's a chip strip in the sticky bar.)
          The <aside> itself is sticky + self-start so it stays put while the product list scrolls. */}
      <aside className="hidden lg:block lg:w-48 lg:shrink-0 lg:self-start lg:sticky lg:top-3 lg:max-h-[calc(100vh-1.5rem)] lg:overflow-auto">
        <CategoryNav variant="sidebar" cats={cats} active={category} onPick={switchCategory} />
      </aside>

      <div className="min-w-0 flex-1">
      {/* Sticky controls: hide on scroll-down (more room for products), reveal instantly on
          scroll-up so the customer can search / switch category without scrolling to the top. */}
      <div
        className="sticky top-0 z-20 -mx-4 mb-3 border-b border-emerald-100/60 bg-[#eef9f0]/95 px-4 pb-2 pt-3 backdrop-blur-sm transition-transform duration-300 will-change-transform"
        style={{ transform: hideBar ? "translateY(-115%)" : "translateY(0)" }}
      >
        <div className="mb-2.5 flex items-center gap-2.5">
          <NavButtons />
          <div className="flex-1 truncate text-2xl font-bold text-brand-dark">{title}</div>
        </div>

        <input
          value={qInput}
          onChange={(e) => onSearch(e.target.value)}
          enterKeyHint="search" placeholder={category ? `Tìm trong ${catLabel(category)}...` : "Tìm sản phẩm..."}
          className="mb-2.5 w-full rounded-2xl border-2 border-emerald-200 bg-white p-3 text-lg shadow-soft outline-none transition focus:border-brand"
        />
        <div className="flex items-center gap-2">
        <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto pb-1">
          <button onClick={() => setParams({ stock: stockOnly ? undefined : "1" })} className={chip(stockOnly)}>
            ✅ Còn hàng
          </button>
          <button onClick={() => setParams({ reco: recoOnly ? undefined : "1" })} className={chip(recoOnly)}>
            ⭐ Khuyên dùng
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
        {/* Card ⟷ List view toggle (default card) */}
        <div className="flex shrink-0 overflow-hidden rounded-full border border-emerald-300 bg-white">
          <button
            onClick={() => chooseView("card")}
            aria-label="Dạng thẻ"
            className={`px-3 py-2 text-lg ${viewMode === "card" ? "bg-brand text-white" : "text-brand-dark"}`}
          >
            ▦
          </button>
          <button
            onClick={() => chooseView("list")}
            aria-label="Dạng danh sách"
            className={`px-3 py-2 text-lg ${viewMode === "list" ? "bg-brand text-white" : "text-brand-dark"}`}
          >
            ☰
          </button>
          </div>
        </div>
        {/* Phone: category chip strip (sidebar shows on tablet+) */}
        <div className="mt-2 lg:hidden">
          <CategoryNav variant="chips" cats={cats} active={category} onPick={switchCategory} />
        </div>
      </div>

      {loading ? (
        <PageLoading />
      ) : view.length === 0 ? (
        <div className="py-8 text-center text-slate-500">
          {q.trim() || stockOnly || recoOnly ? "Không tìm thấy sản phẩm phù hợp." : "Không có sản phẩm."}
        </div>
      ) : viewMode === "list" ? (
        <div className="flex flex-col gap-2.5">
          {visible.map((p, i) => {
            const out = !inStock(p);
            return (
              <button
                key={p.item_code}
                onClick={() => nav.openDetail(p.item_code)}
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                className="animate-rise-in flex items-center gap-3 overflow-hidden rounded-2xl border border-emerald-100 bg-white p-2.5 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-card active:scale-[0.99]"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                  <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="thumb" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span title={p.display_name} className="line-clamp-2 text-base font-extrabold text-brand-dark">{p.best_seller && <span title="Bán chạy">🏆 </span>}{p.recommended && <span title="Khuyên dùng">⭐ </span>}{p.display_name}</span>
                    {p.is_chemical && <span className="rounded-full bg-harvest-light px-1.5 py-0.5 text-[11px] font-bold text-harvest-dark">⚠️</span>}
                  </div>
                  <StockBadge status={p.stock_status} />
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-base font-extrabold text-brand">{p.price_text}</div>
                </div>
                <span className="shrink-0 text-2xl text-slate-300">›</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
          {visible.map((p, i) => {
            const out = !inStock(p);
            return (
              <button
                key={p.item_code}
                onClick={() => nav.openDetail(p.item_code)}
                style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                className="animate-rise-in group flex flex-col overflow-hidden rounded-3xl border border-emerald-100 bg-white text-left shadow-soft transition hover:-translate-y-1 hover:shadow-card active:scale-[0.98]"
              >
                <div className="relative">
                  <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="grid" />
                  {p.is_chemical && (
                    <span className="absolute left-2 top-2 rounded-full bg-harvest-light px-2 py-0.5 text-xs font-bold text-harvest-dark shadow-sm">
                      ⚠️ Hóa chất
                    </span>
                  )}
                  {out && (
                    <span className="absolute right-2 top-2 rounded-full bg-slate-700/85 px-2 py-0.5 text-xs font-bold text-white">
                      Hết hàng
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <div className="line-clamp-2 text-base font-extrabold leading-snug text-brand-dark">{p.best_seller && <span title="Bán chạy">🏆 </span>}{p.recommended && <span title="Khuyên dùng">⭐ </span>}{p.display_name}</div>
                  <div className="mt-auto pt-2 text-lg font-extrabold text-brand">{p.price_text}</div>
                  <StockBadge status={p.stock_status} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Load-more: auto-loads when the sentinel scrolls near, with an explicit button as fallback. */}
      {!loading && hasMore && (
        <div ref={sentinelRef} className="mt-4">
          <button
            onClick={() => setShown((n) => n + 30)}
            className="w-full rounded-2xl border-2 border-emerald-200 bg-white py-3.5 text-lg font-extrabold text-brand-dark shadow-soft"
          >
            Xem thêm ({view.length - shown} sản phẩm)
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

// Category quick-switch (parent → child aware). "sidebar" = vertical accordion (tablet/desktop);
// "chips" = horizontal strip (phones). The active parent's children expand inline so a customer
// can browse a whole group or drill into a sub-category without going back to the home screen.
function CategoryNav({
  variant,
  cats,
  active,
  onPick,
}: {
  variant: "sidebar" | "chips";
  cats: Category[];
  active: string;
  onPick: (category: string) => void;
}) {
  // Which top-level branch is currently active (so we expand its children). `active` is a slug.
  const isActiveBranch = (t: Category) => t.slug === active || (t.children || []).some((c) => c.slug === active);

  if (variant === "chips") {
    // Flat strip: All + top-level; expand the active branch's children right after their parent.
    const strip: { slug: string; icon: string; label: string; child?: boolean; on: boolean }[] = [
      { slug: "", icon: "🛒", label: "Tất cả", on: active === "" },
    ];
    for (const t of cats) {
      strip.push({ slug: t.slug, icon: t.icon, label: t.category, on: t.slug === active });
      if ((t.children?.length || 0) > 0 && isActiveBranch(t)) {
        for (const c of t.children!) strip.push({ slug: c.slug, icon: c.icon, label: c.category, child: true, on: c.slug === active });
      }
    }
    return (
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {strip.map((c) => (
          <button
            key={`${c.child ? "c" : "p"}:${c.slug || "__all"}`}
            onClick={() => onPick(c.slug)}
            className={`flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-bold ${
              c.on ? "border-brand bg-brand text-white" : c.child ? "border-emerald-200 bg-emerald-50 text-brand-dark" : "border-emerald-200 bg-white text-brand-dark"
            }`}
          >
            <span>{c.child ? "›" : c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>
    );
  }

  const Row = ({
    icon,
    label,
    count,
    on,
    child,
    onClick,
  }: {
    icon: string;
    label: string;
    count?: number;
    on: boolean;
    child?: boolean;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className={`mb-0.5 flex w-full items-center gap-2 rounded-xl py-2 text-left text-[15px] font-bold transition ${
        child ? "pl-7 pr-2.5" : "px-2.5"
      } ${on ? "bg-brand text-white" : "text-brand-dark hover:bg-brand-light"}`}
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null ? <span className={`text-xs ${on ? "text-emerald-100" : "text-slate-400"}`}>{count}</span> : null}
    </button>
  );

  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-2 shadow-soft">
      <div className="px-2 pb-1 pt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Loại hàng</div>
      <Row icon="🛒" label="Tất cả" on={active === ""} onClick={() => onPick("")} />
      {cats.map((t) => (
        <div key={t.slug}>
          <Row icon={t.icon} label={t.category} count={t.count} on={t.slug === active} onClick={() => onPick(t.slug)} />
          {/* Children expand/collapse smoothly (grid-rows 0fr↔1fr animates height both ways). */}
          {(t.children?.length || 0) > 0 && (
            <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isActiveBranch(t) ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                {t.children!.map((c) => (
                  <Row key={c.slug} icon={c.icon} label={c.category} count={c.count} on={c.slug === active} child onClick={() => onPick(c.slug)} />
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
