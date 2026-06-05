"use client";

import { useEffect, useState } from "react";
import { frappeCall } from "@/lib/api";
import { useKiosk } from "@/store/kiosk";
import { useKioskNav } from "@/lib/kioskNav";
import { useSession } from "@/lib/session";
import { CatThumb } from "./CatThumb";
import { StoreMapView } from "./StoreMapView";
import { NavButtons } from "./NavButtons";
import { speak } from "@/lib/kioskUi";
import type { Product, ProductCard } from "@/lib/types";

import { PageLoading } from "@/components/ui/Loading";
export function ProductDetail({ code }: { code: string }) {
  const nav = useKioskNav();
  const kiosk = useKiosk();
  // "Quay lại" returns to wherever the customer came FROM (the assistant chat, a category list,
  // the map, or another product). Fall back to this product's category list on a fresh/deep-linked
  // load with no in-app history.
  const goBack = () => nav.goBack(() => nav.openList(product?.category_slug || product?.category || ""));
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [qty, setQty] = useState(1);
  const [mainImg, setMainImg] = useState("");
  const [showMap, setShowMap] = useState(false);
  const { boot } = useSession();

  useEffect(() => {
    let active = true; // tapping related products fast: ignore responses for a product we left
    setLoading(true);
    setError(false);
    frappeCall<Product>("cago.api.kiosk.get_product", { item_code: code }, { method: "GET" })
      .then((p) => {
        if (!active) return;
        setProduct(p);
        setMainImg((p.images && p.images[0]) || p.image || "");
        setQty(kiosk.cart[code]?.qty || 1); // prefill with what's already in the basket
        kiosk.setFocusProduct(p.item_code, p.display_name, p.category);
        frappeCall<ProductCard[]>("cago.api.kiosk.related_products", { item_code: code }, { method: "GET" })
          .then((r) => { if (active) setRelated(r || []); })
          .catch(() => {});
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (loading) return <PageLoading />;
  if (error || !product)
    return (
      <div className="rounded-xl border border-amber-400 bg-amber-100 p-4 text-amber-900">
        Không tải được sản phẩm.{" "}
        <button onClick={nav.goHome} className="underline">
          Về trang chủ
        </button>
      </div>
    );

  const imgs = (product.images || []).filter(Boolean);
  // No expiry/HSD on the kiosk — it's operational info for the owner/staff, not the customer.
  const cartQty = kiosk.cart[product.item_code]?.qty || 0;
  const totalCount = kiosk.cartCount();
  const unit = product.unit ? ` ${product.unit}` : "";

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <NavButtons onBack={goBack} />
      </div>

      {/* On a big in-store screen (lg+) the single touch column wastes half the width: put the
          gallery in a sticky left column and all the info/actions on the right. Phone/tablet keep
          the stacked card. */}
      <div className="animate-rise-in rounded-3xl border border-emerald-100 bg-white p-4 shadow-card lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:p-6">
        <div className="lg:sticky lg:top-4">
        {mainImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mainImg} alt={product.display_name} className="max-h-80 w-full rounded-2xl bg-emerald-50 object-contain lg:max-h-[440px]" />
        ) : (
          <CatThumb icon={product.category_icon} color={product.category_color} name={product.display_name} variant="big" />
        )}
        {imgs.length > 1 && (
          <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto">
            {imgs.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={u}
                src={u}
                alt=""
                onClick={() => setMainImg(u)}
                className={`h-16 w-16 cursor-pointer rounded-lg object-cover ${u === mainImg ? "ring-2 ring-brand" : ""}`}
              />
            ))}
          </div>
        )}
        </div>
        <div>
        <h2 className="mt-3 text-2xl font-bold lg:mt-0">{product.display_name}</h2>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {product.best_seller && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-sm font-bold text-rose-700">🏆 Bán chạy</span>
          )}
          {product.recommended && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">⭐ Cửa hàng khuyên dùng</span>
          )}
        </div>
        <div className="mt-1 text-3xl font-extrabold text-brand">{product.price_text}</div>
        {product.sale_units && product.sale_units.length > 1 && (
          <div className="mt-1 text-slate-600">
            Bán lẻ: <b className="text-brand-dark">{product.sale_units.slice(1).map((u) => u.price_text).join(" · ")}</b>
          </div>
        )}
        {product.public_description && <p className="mt-1">{product.public_description}</p>}
        <div className="text-slate-500">
          Dùng cho: {product.use_cases || "-"} · {product.stock_status || ""}
        </div>
        {product.safety_notes && (
          <div className="mt-3.5 rounded-xl border border-amber-400 bg-amber-100 p-3.5 text-amber-900">⚠️ {product.safety_notes}</div>
        )}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            onClick={() => speak(`${product.display_name}. Giá ${product.price_text}. Dùng cho ${product.use_cases || ""}.`)}
            className="rounded-full bg-harvest px-4 py-2.5 font-extrabold text-white shadow-soft"
          >
            🔊 Đọc to
          </button>
          {boot?.store_map && (
            <button onClick={() => setShowMap(true)} className="rounded-full bg-teal-600 px-4 py-2.5 font-extrabold text-white shadow-soft">
              📍 Xem vị trí
            </button>
          )}
        </div>

        {/* quantity picker — choose how many, no need to tap once per unit */}
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="mb-2 font-bold text-brand-dark">Số lượng{product.unit ? ` (${product.unit})` : ""}</div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQty((n) => Math.max(1, n - 1))}
              aria-label="Bớt"
              className="h-14 w-14 rounded-xl bg-white text-3xl font-extrabold text-brand-dark shadow"
            >
              −
            </button>
            <input
              inputMode="numeric"
              value={qty}
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/[^\d]/g, ""), 10);
                setQty(Number.isNaN(n) ? 1 : Math.max(1, Math.min(n, 9999)));
              }}
              className="h-14 w-20 rounded-xl border-2 border-emerald-300 text-center text-2xl font-extrabold"
            />
            <button
              onClick={() => setQty((n) => n + 1)}
              aria-label="Thêm"
              className="h-14 w-14 rounded-xl bg-white text-3xl font-extrabold text-brand-dark shadow"
            >
              +
            </button>
            <div className="ml-auto flex gap-2">
              {[5, 10].map((step) => (
                <button
                  key={step}
                  onClick={() => setQty((n) => Math.min(n + step, 9999))}
                  className="rounded-full border border-emerald-300 bg-white px-3 py-2 text-sm font-bold text-brand-dark"
                >
                  +{step}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => kiosk.setCartQty(product, qty)}
            className="mt-3 min-h-touch w-full rounded-xl bg-brand py-4 text-xl font-extrabold text-white"
          >
            {cartQty > 0 ? `✓ Cập nhật giỏ (đang có ${cartQty})` : `➕ Thêm ${qty}${unit} vào giỏ`}
          </button>
          {cartQty > 0 && (
            <div className="mt-2 text-center text-brand-dark">
              ✅ Trong giỏ: <b>{cartQty}</b>
              {unit}
            </div>
          )}
        </div>

        {cartQty > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              onClick={() => nav.openList(product.category_slug || product.category || "")}
              className="min-h-touch rounded-xl bg-brand-light py-3 text-lg font-extrabold text-brand-dark"
            >
              ➕ Chọn thêm
            </button>
            <button
              onClick={nav.openCart}
              className="min-h-touch rounded-xl bg-brand-dark py-3 text-lg font-extrabold text-white"
            >
              🛒 Xem giỏ ({totalCount})
            </button>
          </div>
        )}
        </div>
      </div>

      {related.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 font-extrabold">🛒 Sản phẩm liên quan</div>
          {/* Phone/tablet: a swipeable row. Big screen: wrap into a grid so the related items
              fill the width instead of hiding off-screen to the right. */}
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1.5 lg:grid lg:grid-cols-4 lg:overflow-visible xl:grid-cols-5">
            {related.map((r) => (
              <button
                key={r.item_code}
                onClick={() => nav.openDetail(r.item_code)}
                className="flex w-[140px] flex-none flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-card lg:w-auto"
              >
                <CatThumb image={r.image} icon={r.category_icon} color={r.category_color} name={r.display_name} variant="grid" />
                <div className="p-2">
                  {/* Reserve 2 lines for the title so 1-line and 2-line cards stay the same height
                      (else the shorter card's content drifts and the row looks broken). */}
                  <div className="line-clamp-2 min-h-[2.5em] text-sm font-bold leading-tight">{r.best_seller && <span title="Bán chạy">🏆 </span>}{r.recommended && <span title="Khuyên dùng">⭐ </span>}{r.display_name}</div>
                  <div className="mt-0.5 text-[13px] font-bold text-brand">{r.price_text}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showMap && (
        <div className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => setShowMap(false)}>
          <div className="animate-sheet-up max-h-[90vh] w-full max-w-[520px] overflow-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-lg font-extrabold text-brand-dark">📍 Vị trí: {product.display_name}</div>
              <button onClick={() => setShowMap(false)} className="rounded-lg bg-slate-200 px-3 py-1.5 font-bold text-slate-700">Đóng</button>
            </div>
            <StoreMapView focusCategory={product.category} />
            <p className="mt-2 text-center text-sm text-slate-500">
              {product.shelf_location ? `Vị trí ghi chú: ${product.shelf_location}` : "Sơ đồ tham khảo"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
