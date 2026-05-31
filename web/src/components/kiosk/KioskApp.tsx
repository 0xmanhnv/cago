"use client";

import { useCallback, useEffect, useState } from "react";
import { frappeCall } from "@/lib/api";
import { useKiosk } from "@/store/kiosk";
import { catColor, catIcon, EXPIRY_LABEL, speak } from "@/lib/kioskUi";
import type { Category, Product, ProductCard } from "@/lib/types";
import { Assistant } from "./Assistant";
import { FloatingFab } from "./FloatingFab";

type View = "home" | "list" | "detail" | "cart" | "chat" | "callstaff";

export function KioskApp() {
  const kiosk = useKiosk();

  const [view, setView] = useState<View>("home");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<ProductCard[]>([]);
  const [listTitle, setListTitle] = useState("");
  const [search, setSearch] = useState("");

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setLoading(true);
    setError(false);
    try {
      return await fn();
    } catch {
      setError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const goHome = useCallback(async () => {
    kiosk.clearFocus();
    setView("home");
    const cats = await run(() =>
      frappeCall<Category[]>("cago.api.kiosk.get_categories", {}, { method: "GET" }),
    );
    if (cats) setCategories(cats);
  }, [kiosk, run]);

  useEffect(() => {
    void goHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openList = async (category: string, query?: string) => {
    kiosk.setFocusCategory(category);
    setListTitle(category || (query ? `Kết quả: ${query}` : "Tất cả"));
    setView("list");
    const list = await run(() =>
      frappeCall<ProductCard[]>(
        "cago.api.kiosk.list_products",
        { category: category || null, query: query || null },
        { method: "GET" },
      ),
    );
    setProducts(list || []);
  };

  const openDetail = async (code: string) => {
    setView("detail");
    setRelated([]);
    const p = await run(() =>
      frappeCall<Product>("cago.api.kiosk.get_product", { item_code: code }, { method: "GET" }),
    );
    if (p) {
      setProduct(p);
      kiosk.setFocusProduct(p.item_code, p.display_name, p.category);
      frappeCall<ProductCard[]>("cago.api.kiosk.related_products", { item_code: code }, { method: "GET" })
        .then((r) => setRelated(r || []))
        .catch(() => {});
    }
  };

  const openChat = () => {
    kiosk.ensureFreshSession();
    setView("chat");
  };

  const submitCart = async () => {
    const items = Object.values(kiosk.cart).map((x) => ({ item_code: x.product.item_code, qty: x.qty }));
    return run(() =>
      frappeCall<{ code: string; count: number }>("cago.api.kiosk.create_wanted_list", {
        items: JSON.stringify(items),
      }),
    );
  };

  const cartCount = kiosk.cartCount();
  const showFabs = view === "list" || view === "detail" || view === "cart";

  return (
    <div className="mx-auto max-w-[900px] px-4 pb-24 pt-4 text-[#14271b]">
      {loading && <div className="py-8 text-center text-slate-500">Đang tải...</div>}

      {error && !loading && (
        <div className="rounded-xl border border-amber-400 bg-amber-100 p-4 text-amber-900">
          Lỗi tải dữ liệu. Bác kiểm tra mạng rồi thử lại.
          <button onClick={goHome} className="ml-2 underline">
            Tải lại
          </button>
        </div>
      )}

      {!loading && view === "home" && (
        <Home
          categories={categories}
          search={search}
          setSearch={setSearch}
          onPickCategory={openList}
          onSearch={() => openList("", search.trim())}
          onChat={openChat}
          onCallStaff={() => setView("callstaff")}
        />
      )}

      {!loading && view === "list" && (
        <List title={listTitle} products={products} onBack={goHome} onOpen={openDetail} />
      )}

      {!loading && view === "detail" && product && (
        <Detail product={product} related={related} onBack={() => openList(kiosk.focusCat, "")} onOpen={openDetail} />
      )}

      {view === "cart" && <Cart onBack={goHome} onSubmit={submitCart} />}

      {view === "chat" && (
        <Assistant onClose={goHome} onOpenProduct={openDetail} onCallStaff={() => setView("callstaff")} />
      )}

      {view === "callstaff" && <CallStaff onDone={goHome} />}

      {/* fixed cart bar */}
      {cartCount > 0 && view !== "chat" && view !== "cart" && (
        <button
          onClick={() => setView("cart")}
          className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between bg-brand-dark px-5 py-3.5 text-lg font-extrabold text-white"
        >
          <span>🧺 Đã chọn: {cartCount} sản phẩm</span>
          <span>Xem &amp; gửi →</span>
        </button>
      )}

      {/* draggable floating buttons */}
      {showFabs && (
        <>
          <FloatingFab
            storageKey="cago_fab_call"
            onTap={() => setView("callstaff")}
            title="Gọi người bán"
            style={{ position: "fixed", top: 10, right: 10, zIndex: 55 }}
            className="rounded-full bg-red-600 px-4 py-2.5 text-[15px] font-extrabold text-white shadow-lg"
          >
            🔔 Gọi người bán
          </FloatingFab>
          <FloatingFab
            storageKey="cago_fab_chat"
            onTap={openChat}
            title="Hỏi trợ lý"
            style={{ position: "fixed", right: 10, bottom: 78, zIndex: 55 }}
            className="rounded-full bg-violet-600 px-4 py-3 text-base font-extrabold text-white shadow-lg"
          >
            🤖 Hỏi trợ lý
          </FloatingFab>
        </>
      )}
    </div>
  );
}

/* ----------------------------- sub-views ----------------------------- */

function CatThumb({
  image,
  icon,
  color,
  name,
  variant,
}: {
  image?: string | null;
  icon?: string;
  color?: string;
  name: string;
  variant: "grid" | "big";
}) {
  const h = variant === "big" ? "h-64" : "h-[150px]";
  if (image)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name} className={`w-full ${h} object-cover`} />;
  return (
    <div
      className={`flex w-full ${h} flex-col items-center justify-center`}
      style={{ background: catColor(color) }}
    >
      <span className={variant === "big" ? "text-7xl" : "text-5xl"}>{catIcon(icon)}</span>
    </div>
  );
}

function Home({
  categories,
  search,
  setSearch,
  onPickCategory,
  onSearch,
  onChat,
  onCallStaff,
}: {
  categories: Category[];
  search: string;
  setSearch: (s: string) => void;
  onPickCategory: (c: string) => void;
  onSearch: () => void;
  onChat: () => void;
  onCallStaff: () => void;
}) {
  return (
    <div>
      <div className="my-5 text-center text-3xl font-extrabold text-brand-dark">BÁC CẦN MUA GÌ?</div>
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="Tìm sản phẩm..."
          className="w-full rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
        />
      </div>
      <div className="mx-1 mb-2 text-base font-extrabold text-brand-dark">🧺 Chọn loại hàng</div>
      <div className="grid grid-cols-2 gap-4">
        {categories.map((c) => (
          <button
            key={c.category}
            onClick={() => onPickCategory(c.category)}
            className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-2xl p-3 text-xl font-extrabold text-brand-dark"
            style={{ background: catColor(c.color) }}
          >
            <span className="text-5xl leading-none">{catIcon(c.icon)}</span>
            <span>{c.category}</span>
            <span className="text-sm font-semibold opacity-80">{c.count} loại</span>
          </button>
        ))}
        <button
          onClick={() => onPickCategory("")}
          className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-2xl bg-slate-500 p-3 text-xl font-extrabold text-white"
        >
          <span className="text-5xl leading-none">🛒</span>
          <span>Xem tất cả</span>
        </button>
      </div>
      <div className="mx-1 mb-2 mt-5 text-base font-extrabold text-brand-dark">💬 Cần giúp đỡ?</div>
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={onChat}
          className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-2xl bg-violet-600 p-3 text-xl font-extrabold text-white"
        >
          <span className="text-5xl leading-none">🤖</span>
          <span>Hỏi trợ lý</span>
        </button>
        <button
          onClick={onCallStaff}
          className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-2xl bg-red-600 p-3 text-xl font-extrabold text-white"
        >
          <span className="text-5xl leading-none">🔔</span>
          <span>Gọi người bán</span>
        </button>
      </div>
    </div>
  );
}

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <button onClick={onBack} className="rounded-xl bg-brand-light px-4 py-3 text-lg font-extrabold text-brand-dark">
        ← {label}
      </button>
    </div>
  );
}

function List({
  title,
  products,
  onBack,
  onOpen,
}: {
  title: string;
  products: ProductCard[];
  onBack: () => void;
  onOpen: (code: string) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <button onClick={onBack} className="rounded-xl bg-brand-light px-4 py-3 text-lg font-extrabold text-brand-dark">
          ← Trang chủ
        </button>
        <div className="flex-1 text-[22px] font-bold text-brand-dark">{title}</div>
      </div>
      {products.length === 0 ? (
        <div className="py-8 text-center text-slate-500">Không có sản phẩm.</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
          {products.map((p) => (
            <button
              key={p.item_code}
              onClick={() => onOpen(p.item_code)}
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

function Detail({
  product,
  related,
  onBack,
  onOpen,
}: {
  product: Product;
  related: ProductCard[];
  onBack: () => void;
  onOpen: (code: string) => void;
}) {
  const kiosk = useKiosk();
  const [added, setAdded] = useState(false);
  const imgs = (product.images || []).filter(Boolean);
  const [mainImg, setMainImg] = useState(imgs[0] || product.image || "");
  const exp = product.expiry_status && EXPIRY_LABEL[product.expiry_status];

  return (
    <div>
      <BackBar label="Quay lại" onBack={onBack} />
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
          <div className="mt-3.5 rounded-xl border border-amber-400 bg-amber-100 p-3.5 text-amber-900">
            ⚠️ {product.safety_notes}
          </div>
        )}
        <button
          onClick={() =>
            speak(`${product.display_name}. Giá ${product.price_text}. Dùng cho ${product.use_cases || ""}.`)
          }
          className="mt-2.5 rounded-lg bg-teal-600 px-4 py-2.5 font-extrabold text-white"
        >
          🔊 Đọc to
        </button>
        <button
          onClick={() => {
            kiosk.addToCart(product);
            setAdded(true);
          }}
          className="mt-3.5 min-h-touch w-full rounded-xl bg-brand py-4 text-xl font-extrabold text-white"
        >
          {added ? "✅ Đã thêm! (chọn tiếp hoặc xem giỏ)" : "➕ Chọn sản phẩm này"}
        </button>
      </div>

      {related.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 font-extrabold">🛒 Sản phẩm liên quan</div>
          <div className="flex gap-2.5 overflow-x-auto pb-1.5">
            {related.map((r) => (
              <button
                key={r.item_code}
                onClick={() => onOpen(r.item_code)}
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

function Cart({ onBack, onSubmit }: { onBack: () => void; onSubmit: () => Promise<{ code: string } | null> }) {
  const kiosk = useKiosk();
  const lines = Object.values(kiosk.cart);
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (lines.length === 0 && !result) {
    onBack();
    return null;
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <button onClick={onBack} className="rounded-xl bg-brand-light px-4 py-3 text-lg font-extrabold text-brand-dark">
          ← Tiếp tục chọn
        </button>
        <div className="flex-1 text-[22px] font-bold text-brand-dark">Giỏ đã chọn</div>
      </div>
      {result ? (
        <div className="rounded-2xl bg-white p-4 text-center">
          <div className="my-4 rounded-2xl border-2 border-dashed border-brand bg-brand-light px-5 py-5 text-4xl font-black tracking-widest text-brand-dark">
            {result}
          </div>
          <p className="text-lg">Bác đọc mã này cho người bán để lấy hàng nhé!</p>
          <button onClick={onBack} className="mt-3 min-h-touch w-full rounded-xl bg-teal-600 py-3.5 text-lg font-extrabold text-white">
            Xong
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-white p-4">
          {lines.map((x) => (
            <div key={x.product.item_code} className="flex items-center justify-between border-b border-slate-100 py-2.5">
              <span>
                <b>{x.product.display_name}</b>
                <br />
                <span className="font-bold text-brand">{x.product.price_text}</span>
              </span>
              <span className="flex items-center gap-2">
                <button
                  onClick={() => kiosk.setQty(x.product.item_code, x.qty - 1)}
                  className="h-11 w-11 rounded-lg bg-brand-light text-2xl font-extrabold"
                >
                  −
                </button>
                <b className="text-xl">{x.qty}</b>
                <button
                  onClick={() => kiosk.setQty(x.product.item_code, x.qty + 1)}
                  className="h-11 w-11 rounded-lg bg-brand-light text-2xl font-extrabold"
                >
                  +
                </button>
              </span>
            </div>
          ))}
          <button
            disabled={submitting}
            onClick={async () => {
              setSubmitting(true);
              const r = await onSubmit();
              setSubmitting(false);
              if (r) {
                setResult(r.code);
                kiosk.clearCart();
              }
            }}
            className="mt-3.5 min-h-touch w-full rounded-xl bg-brand py-4 text-xl font-extrabold text-white disabled:opacity-50"
          >
            📨 Gửi cho người bán
          </button>
        </div>
      )}
    </div>
  );
}

function CallStaff({ onDone }: { onDone: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-5">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center">
        <div className="text-6xl">🔔</div>
        <h2 className="mt-2 text-2xl font-bold text-red-600">Đã gọi người bán!</h2>
        <p className="text-lg">Bác chờ một chút, người bán sẽ tới giúp bác ngay ạ.</p>
        <button onClick={onDone} className="mt-4 min-h-touch w-full rounded-xl bg-brand py-3.5 text-xl font-extrabold text-white">
          Đã hiểu
        </button>
      </div>
    </div>
  );
}
