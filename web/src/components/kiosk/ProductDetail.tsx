"use client";

import { useEffect, useState } from "react";
import { frappeCall } from "@/lib/api";
import { useKiosk } from "@/store/kiosk";
import { useKioskNav } from "@/lib/kioskNav";
import { CatThumb } from "./CatThumb";
import { EXPIRY_LABEL, speak } from "@/lib/kioskUi";
import type { Product, ProductCard } from "@/lib/types";

export function ProductDetail({ code }: { code: string }) {
  const nav = useKioskNav();
  const kiosk = useKiosk();
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [qty, setQty] = useState(1);
  const [mainImg, setMainImg] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(false);
    frappeCall<Product>("cago.api.kiosk.get_product", { item_code: code }, { method: "GET" })
      .then((p) => {
        setProduct(p);
        setMainImg((p.images && p.images[0]) || p.image || "");
        setQty(kiosk.cart[code]?.qty || 1); // prefill with what's already in the basket
        kiosk.setFocusProduct(p.item_code, p.display_name, p.category);
        frappeCall<ProductCard[]>("cago.api.kiosk.related_products", { item_code: code }, { method: "GET" })
          .then((r) => setRelated(r || []))
          .catch(() => {});
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (loading) return <div className="py-8 text-center text-slate-500">Đang tải...</div>;
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
  const exp = product.expiry_status ? EXPIRY_LABEL[product.expiry_status] : undefined;
  const cartQty = kiosk.cart[product.item_code]?.qty || 0;
  const totalCount = kiosk.cartCount();
  const unit = product.unit ? ` ${product.unit}` : "";

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <button
          onClick={() => nav.openList(product.category || "")}
          className="rounded-xl bg-brand-light px-4 py-3 text-lg font-extrabold text-brand-dark"
        >
          ← Quay lại
        </button>
      </div>

      <div className="rounded-2xl bg-white p-4">
        {mainImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mainImg} alt={product.display_name} className="max-h-80 w-full rounded-xl bg-emerald-50 object-contain" />
        ) : (
          <CatThumb icon={product.category_icon} color={product.category_color} name={product.display_name} variant="big" />
        )}
        {imgs.length > 1 && (
          <div className="mt-2.5 flex gap-2 overflow-x-auto">
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
        <h2 className="mt-3 text-2xl font-bold">{product.display_name}</h2>
        <div className="text-3xl font-extrabold text-brand">{product.price_text}</div>
        {product.sale_units && product.sale_units.length > 1 && (
          <div className="mt-1 text-slate-600">
            Bán lẻ: <b className="text-brand-dark">{product.sale_units.slice(1).map((u) => u.price_text).join(" · ")}</b>
          </div>
        )}
        {product.public_description && <p className="mt-1">{product.public_description}</p>}
        <div className="text-slate-500">
          Dùng cho: {product.use_cases || "-"} · {product.stock_status || ""}
        </div>
        {exp && exp.text && (
          <div className={`mt-2 inline-block rounded-lg border px-2.5 py-1 text-sm font-bold ${exp.cls}`}>
            {exp.text}
            {product.expiry_text ? ` — HSD ${product.expiry_text}` : ""}
          </div>
        )}
        {product.safety_notes && (
          <div className="mt-3.5 rounded-xl border border-amber-400 bg-amber-100 p-3.5 text-amber-900">⚠️ {product.safety_notes}</div>
        )}
        <button
          onClick={() => speak(`${product.display_name}. Giá ${product.price_text}. Dùng cho ${product.use_cases || ""}.`)}
          className="mt-2.5 rounded-lg bg-teal-600 px-4 py-2.5 font-extrabold text-white"
        >
          🔊 Đọc to
        </button>

        {/* quantity picker — choose how many, no need to tap once per unit */}
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
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
              onClick={() => nav.openList(product.category || "")}
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

      {related.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 font-extrabold">🛒 Sản phẩm liên quan</div>
          <div className="flex gap-2.5 overflow-x-auto pb-1.5">
            {related.map((r) => (
              <button
                key={r.item_code}
                onClick={() => nav.openDetail(r.item_code)}
                className="w-[140px] flex-none overflow-hidden rounded-xl bg-white text-left shadow"
              >
                <CatThumb image={r.image} icon={r.category_icon} color={r.category_color} name={r.display_name} variant="grid" />
                <div className="p-1.5">
                  <div className="text-sm font-bold">{r.display_name}</div>
                  <div className="text-[13px] font-bold text-brand">{r.price_text}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
