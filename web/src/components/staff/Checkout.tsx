"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { useSession } from "@/lib/session";
import { CategoryNav } from "@/components/ui/CategoryNav";
import { CatThumb } from "@/components/kiosk/CatThumb";
import { confirmDialog, alertDialog } from "@/components/ui/dialog";
import type { ProductCard, Product, Category } from "@/lib/types";

type PayMode = "cash" | "bank" | "credit" | "split";
interface SaleResult {
  invoice: string;
  total: number;
  total_text: string;
  payment_mode: PayMode;
  item_count: number;
  outstanding_text?: string | null;
  paid_text?: string | null;
  change_text?: string | null;
}
interface Cust {
  customer: string;
  customer_name: string;
  village?: string;
  mobile?: string;
  outstanding_text?: string;
}
interface Meta {
  sale_units: { uom: string; label?: string; price_text: string }[];
  stock_uom: string;
  stock_qty: number;
  stock_auto?: boolean;
  stock_status?: string | null;
}
interface Line {
  qty: number;
  uom: string;
  rate?: number; // owner-gated manual price override (mặc cả); undefined = use price-list rate
}
interface RecentSale {
  invoice: string;
  customer_name: string;
  total_text: string;
  date_group: string;
  time: string;
  item_count: number;
}

const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
// Live thousands-grouping for a money input as the user types: "10000" → "10.000".
const fmtAmt = (s: string) => {
  const d = (s || "").replace(/[^\d]/g, "");
  return d ? Number(d).toLocaleString("vi-VN") : "";
};
const parsePrice = (t: string) => parseInt((t || "").replace(/[^\d]/g, ""), 10) || 0;
const trim = (n: number) => (Number.isInteger(n) ? n : Math.round(n * 100) / 100);
const MODE_VI: Record<PayMode, string> = { cash: "Tiền mặt", bank: "Chuyển khoản", credit: "Ghi nợ", split: "Nhiều hình thức" };

// Held (parked) orders — let staff pause a sale to serve another customer. sessionStorage so
// a refresh doesn't lose them; tied to the browser session.
interface Held {
  id: string;
  at: string;
  cust: Cust | null;
  lines: Record<string, Line>;
  meta: Record<string, Meta>;
  count: number;
}
const HELD_KEY = "cago_held_orders";
const loadHeld = (): Held[] => {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.sessionStorage.getItem(HELD_KEY) || "[]");
  } catch {
    return [];
  }
};
const saveHeld = (h: Held[]) => window.sessionStorage?.setItem(HELD_KEY, JSON.stringify(h));

interface Receipt {
  invoice: string;
  store: string;
  when: string;
  lines: { name: string; qty: number; uom: string; rate_text: string; amount_text: string }[];
  total_text: string;
  paid_text?: string | null;
  outstanding_text?: string | null;
  safety?: string | null;
}
const esc = (s: string) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

// Receipt printers vary by shop: cheap 58mm thermal, wider 80mm thermal, or an A5 sheet on a
// regular printer. Each needs its own @page size + body width so the receipt isn't clipped.
type PaperSize = "58" | "80" | "a5";
const PAPER: Record<PaperSize, { page: string; width: string; base: string; line: string; tot: string; label: string }> = {
  "58": { page: "58mm auto", width: "54mm", base: "11px", line: "10px", tot: "14px", label: "58mm" },
  "80": { page: "80mm auto", width: "76mm", base: "12px", line: "11px", tot: "16px", label: "80mm" },
  a5: { page: "A5", width: "135mm", base: "13px", line: "12px", tot: "18px", label: "A5 (giấy thường)" },
};
const PAPER_KEY = "cago_pos_paper";
const loadPaper = (): PaperSize => {
  const v = (typeof window !== "undefined" && window.localStorage?.getItem(PAPER_KEY)) || "58";
  return v === "80" || v === "a5" ? v : "58";
};

async function printReceipt(invoice: string, size: PaperSize = loadPaper()) {
  // Open the print window SYNCHRONOUSLY (still inside the click gesture) — if we opened it after
  // the awaited fetch below, popup blockers would silently kill it.
  const w = window.open("", "_blank", "width=380,height=640");
  const r = await frappeCall<Receipt>("cago.api.sales.get_receipt", { invoice }, { method: "GET" });
  const p = PAPER[size];
  const rows = r.lines
    .map(
      (l) =>
        `<div class="it"><div>${esc(l.name)}</div><div class="r">${trim(l.qty)} ${esc(l.uom)} x ${l.rate_text} = <b>${l.amount_text}</b></div></div>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.invoice)}</title>
  <style>@page{size:${p.page};margin:${size === "a5" ? "8mm" : "2mm"}}body{width:${p.width};font-family:monospace;font-size:${p.base};color:#000}
  h3{text-align:center;margin:2px 0}.c{text-align:center}.it{border-bottom:1px dashed #999;padding:2px 0}.r{font-size:${p.line}}
  .tot{font-weight:bold;font-size:${p.tot};text-align:right;margin-top:4px}.sf{font-size:9px;border-top:1px solid #000;margin-top:4px;padding-top:3px}</style>
  </head><body>
  <h3>${esc(r.store)}</h3>
  <div class="c">HOÁ ĐƠN BÁN HÀNG</div>
  <div class="c">${esc(r.when)} · ${esc(r.invoice)}</div>
  <hr>${rows}
  <div class="tot">TỔNG: ${r.total_text}</div>
  ${r.paid_text ? `<div class="r">Khách trả: ${r.paid_text}</div>` : ""}
  ${r.outstanding_text ? `<div class="r">Còn nợ: ${r.outstanding_text}</div>` : ""}
  ${r.safety ? `<div class="sf">${esc(r.safety)}</div>` : ""}
  <div class="c" style="margin-top:6px">Cảm ơn quý khách!</div>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`;
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

export function Checkout() {
  const router = useRouter();
  const { boot } = useSession();
  const allowPriceEdit = !!boot?.allow_price_edit; // server re-checks; this only shows the field
  const [list, setList] = useState<ProductCard[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const STAFF_PAGE = 30;
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [cust, setCust] = useState<Cust | null>(null); // null = Khách lẻ
  const [showCust, setShowCust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaleResult | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [held, setHeld] = useState<Held[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [discount, setDiscount] = useState("");
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [custInPanel, setCustInPanel] = useState(false); // change-customer picker inside the pay panel
  const [viewMode, setViewMode] = useState<"list" | "card">("list"); // staff default = dense list (speed)
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null); // applied code
  const [couponDisc, setCouponDisc] = useState(0);
  const [couponMsg, setCouponMsg] = useState<React.ReactNode>(null);
  const [discOpen, setDiscOpen] = useState(false); // collapsible discount/coupon section in the pay panel
  // App-wide styled confirm/alert (see components/ui/dialog).
  const ask = confirmDialog;
  const notify = alertDialog;
  const [autoPrint, setAutoPrint] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [splitCash, setSplitCash] = useState("");
  const [splitBank, setSplitBank] = useState("");
  const [paper, setPaperState] = useState<PaperSize>("58");
  const [showReprint, setShowReprint] = useState(false);
  const [recent, setRecent] = useState<RecentSale[]>([]);
  const [recentQ, setRecentQ] = useState("");
  const [keypad, setKeypad] = useState<string | null>(null); // item_code whose qty is being typed
  const [shiftRefresh, setShiftRefresh] = useState(0); // bump to re-pull the till shift after a sale
  const [payOpen, setPayOpen] = useState(false); // bottom bar: collapsed summary vs full payment panel
  const [cats, setCats] = useState<Category[]>([]); // category quick-filter (sidebar/chips)
  const [category, setCategory] = useState(""); // active category filter ("" = all)
  const [shiftOpen, setShiftOpen] = useState(true); // till shift status (lifted from ShiftBar); selling requires it
  const shiftOpenRef = useRef(true); // mirror for synchronous reads (guard fires inside the same tick as open)
  const [openShiftFor, setOpenShiftFor] = useState(false); // show "open shift" prompt before completing a sale
  const [openCash, setOpenCash] = useState("");
  const pendingPayRef = useRef<null | (() => void)>(null); // checkout to resume once the shift is opened
  const setShiftState = (open: boolean) => {
    shiftOpenRef.current = open;
    setShiftOpen(open);
  };
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setHeld(loadHeld());
    setAutoPrint(window.localStorage?.getItem("cago_pos_autoprint") === "1");
    setPaperState(loadPaper());
    const v = window.localStorage?.getItem("cago_sell_view");
    if (v === "list" || v === "card") setViewMode(v);
  }, []);
  const chooseView = (v: "list" | "card") => {
    setViewMode(v);
    window.localStorage?.setItem("cago_sell_view", v);
  };

  const setPaper = (p: PaperSize) => {
    setPaperState(p);
    window.localStorage?.setItem(PAPER_KEY, p);
  };
  const openReprint = async () => {
    setShowReprint(true);
    try {
      setRecent((await frappeCall<RecentSale[]>("cago.api.sales.list_recent_sales", { limit: 40 }, { method: "GET" })) || []);
    } catch {
      setRecent([]);
    }
  };

  const run = async (query: string, cat: string = category) => {
    setLoading(true);
    try {
      const r = (await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query, category: cat || null, start: 0 }, { method: "GET" })) || [];
      setList(r);
      setHasMore(r.length >= STAFF_PAGE);
    } catch {
      setList([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };
  // Infinite scroll: fetch the next page and append (server paginates by `start`).
  const loadMore = async () => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const r = (await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query: q, category: category || null, start: list.length }, { method: "GET" })) || [];
      setList((prev) => [...prev, ...r]);
      setHasMore(r.length >= STAFF_PAGE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };
  useEffect(() => {
    void run("");
    frappeCall<Category[]>("cago.api.staff.list_categories", {}, { method: "GET" }).then((d) => setCats(d || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Switching category clears the text search and lists that category (browse mode).
  const pickCategory = (c: string) => {
    setCategory(c);
    setQ("");
    void run("", c);
  };
  // Auto load-more when the bottom sentinel scrolls into view.
  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es[0]?.isIntersecting && void loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, loadingMore, list.length, q, category]);

  const ensureMeta = async (code: string): Promise<Meta | null> => {
    if (meta[code]) return meta[code];
    try {
      const p = await frappeCall<Product>("cago.api.staff.get_product", { item_code: code }, { method: "GET" });
      const m: Meta = {
        sale_units: p.sale_units && p.sale_units.length ? p.sale_units : [{ uom: p.unit || "", price_text: p.price_text }],
        stock_uom: p.unit || "",
        stock_qty: p.actual_stock_qty ?? 0,
        stock_auto: p.stock_auto,
        stock_status: p.stock_status,
      };
      setMeta((x) => ({ ...x, [code]: m }));
      return m;
    } catch {
      return null;
    }
  };

  // Out of stock only matters for items that actually track on-hand (stock_auto).
  const cardOOS = (p: ProductCard) => !!p.stock_auto && (p.actual_stock_qty ?? 0) <= 0;
  const lineOOS = (code: string) => {
    const m = meta[code];
    return !!m?.stock_auto && (m.stock_qty ?? 0) <= 0;
  };

  const add = async (code: string, card?: ProductCard) => {
    // Warn up-front instead of failing at payment: out-of-stock is sellable (back-order) but
    // the staff must confirm so it's never a surprise. Negative stock is allowed server-side.
    // (Barcode scans pass no card → no warning, since scanning implies the item is in hand.)
    if (card && cardOOS(card) && !(await ask(`"${card.display_name}" đang hết hàng trên hệ thống. Vẫn bán (bán âm tồn)?`, { danger: true, confirmLabel: "Vẫn bán" }))) return;
    const m = await ensureMeta(code);
    setLines((l) => (l[code] ? l : { ...l, [code]: { qty: 1, uom: m?.stock_uom || "" } }));
  };
  const setQty = (code: string, qty: number) =>
    setLines((l) => {
      const copy = { ...l };
      // Guard !copy[code]: the keypad can commit after its line was removed — don't resurrect a
      // line with no uom (which would break pricing and send uom:undefined to quick_sale).
      if (qty <= 0 || !copy[code]) delete copy[code];
      else copy[code] = { ...copy[code], qty: trim(qty) };
      return copy;
    });
  // Changing the unit changes the base price, so drop any manual override when the UOM flips.
  const setUom = (code: string, uom: string) => setLines((l) => ({ ...l, [code]: { ...l[code], uom, rate: undefined } }));
  const setRate = (code: string, raw: string) =>
    setLines((l) => {
      const v = parseInt((raw || "").replace(/[^\d]/g, ""), 10);
      return { ...l, [code]: { ...l[code], rate: Number.isFinite(v) && raw.trim() !== "" ? v : undefined } };
    });

  const unitPrice = (code: string, uom: string) => {
    const u = meta[code]?.sale_units.find((s) => s.uom === uom);
    return parsePrice(u?.price_text || list.find((p) => p.item_code === code)?.price_text || "");
  };
  // Vietnamese label for a stored unit code (kg10 → "Yến"); falls back to the code itself.
  const labelOf = (code: string, uom: string) =>
    meta[code]?.sale_units.find((s) => s.uom === uom)?.label || uom;
  // Price actually charged for a line: manual override (if owner allows + set) else price-list rate.
  const linePrice = (code: string) => lines[code]?.rate ?? unitPrice(code, lines[code]?.uom ?? "");
  const cartCodes = Object.keys(lines);
  const subtotal = cartCodes.reduce((s, c) => s + linePrice(c) * lines[c].qty, 0);
  const discountNum = parseInt((discount || "").replace(/[^\d]/g, ""), 10) || 0;
  // Discount can be a fixed đồng amount or a % of the subtotal (rural staff say "bớt 10%").
  const discRaw = discountMode === "percent" ? Math.round((subtotal * Math.min(discountNum, 100)) / 100) : discountNum;
  const disc = Math.max(0, Math.min(discRaw, subtotal));
  const estimate = Math.max(0, subtotal - disc - couponDisc);

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponMsg(null);
    try {
      const r = await frappeCall<{ code: string; discount_amount: number; discount_text: string }>(
        "cago.api.coupon.apply_coupon",
        { code, subtotal },
        { method: "GET" },
      );
      setCoupon(r.code);
      setCouponDisc(r.discount_amount);
      setCouponInput(r.code);
      setCouponMsg(<span className="font-bold text-brand">🎟 Đã áp mã {r.code}: −{r.discount_text}</span>);
    } catch (e) {
      setCoupon(null);
      setCouponDisc(0);
      setCouponMsg(<span className="font-bold text-red-600">{e instanceof Error ? e.message : "Mã không dùng được."}</span>);
    }
  };
  const clearCoupon = () => {
    setCoupon(null);
    setCouponDisc(0);
    setCouponInput("");
    setCouponMsg(null);
  };
  // Keep a % coupon's preview in sync when the cart changes; drop it if it no longer qualifies.
  useEffect(() => {
    if (!coupon) return;
    let cancelled = false;
    frappeCall<{ discount_amount: number }>("cago.api.coupon.apply_coupon", { code: coupon, subtotal }, { method: "GET" })
      .then((r) => !cancelled && setCouponDisc(r.discount_amount))
      .catch(() => {
        if (cancelled) return;
        setCoupon(null);
        setCouponDisc(0);
        setCouponMsg(<span className="font-bold text-red-600">Mã không còn áp dụng được (đơn đã thay đổi).</span>);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, coupon]);

  const findBarcode = async (code: string) => {
    if (!code.trim()) return;
    try {
      const r = await frappeCall<{ item_code: string | null }>("cago.api.catalog.find_by_barcode", { barcode: code.trim() }, { method: "GET" });
      if (r.item_code) await add(r.item_code);
      else await notify("Không tìm thấy sản phẩm với mã vạch này.");
    } catch {
      await notify("Không tra được mã vạch.", { danger: true });
    }
  };

  const holdOrder = () => {
    if (cartCodes.length === 0) return;
    const h: Held = { id: String(Date.now()), at: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }), cust, lines, meta, count: cartCodes.length };
    const next = [h, ...held];
    setHeld(next);
    saveHeld(next);
    setLines({});
    setCust(null);
    clearCoupon();
    setPayOpen(false);
  };
  const resumeOrder = (h: Held) => {
    setLines(h.lines);
    setMeta((m) => ({ ...m, ...h.meta }));
    setCust(h.cust);
    const next = held.filter((x) => x.id !== h.id);
    setHeld(next);
    saveHeld(next);
    setShowHeld(false);
  };
  const dropHeld = (id: string) => {
    const next = held.filter((x) => x.id !== id);
    setHeld(next);
    saveHeld(next);
  };

  // Selling requires an open till shift (so the day's cash reconciles). Instead of blocking the
  // whole screen, we gate at payment: stash the intended sale and prompt to open the shift first.
  const guardShift = (resume: () => void) => {
    if (shiftOpenRef.current) return true;
    pendingPayRef.current = resume;
    setOpenShiftFor(true);
    return false;
  };
  const confirmOpenShift = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await frappeCall("cago.api.shift.open_shift", { opening_cash: parseInt((openCash || "").replace(/[^\d]/g, ""), 10) || 0 });
      setShiftState(true);
      setShiftRefresh((n) => n + 1);
      setOpenShiftFor(false);
      setOpenCash("");
      const resume = pendingPayRef.current;
      pendingPayRef.current = null;
      resume?.();
    } catch (e) {
      await notify(`Lỗi: ${e instanceof Error ? e.message : "không mở được ca."}`, { danger: true });
    } finally {
      setBusy(false);
    }
  };

  const checkout = async (payment_mode: PayMode) => {
    if (cartCodes.length === 0 || busy) return;
    if (payment_mode === "credit" && !cust) {
      await notify("Chọn khách hàng để ghi nợ (bấm vào ô khách ở trên).");
      return;
    }
    if (!guardShift(() => checkout(payment_mode))) return;
    const who = cust ? ` cho ${cust.customer_name}` : "";
    if (!(await ask(`${MODE_VI[payment_mode]} ${cartCodes.length} mặt hàng${who}?`, { confirmLabel: MODE_VI[payment_mode] }))) return;
    setBusy(true);
    try {
      const r = await frappeCall<SaleResult>("cago.api.sales.quick_sale", {
        items: cartCodes.map((c) => ({ item_code: c, qty: lines[c].qty, uom: lines[c].uom, rate: allowPriceEdit ? lines[c].rate : undefined })),
        payment_mode,
        customer: cust?.customer || null,
        discount_amount: disc || 0,
        coupon: coupon || undefined,
      });
      setResult(r);
      setShiftRefresh((n) => n + 1);
      setLines({});
      setDiscount("");
      clearCoupon();
      setPayOpen(false);
      if (autoPrint) void printReceipt(r.invoice, paper);
      if (payment_mode === "bank") {
        const v = await frappeCall<{ configured: boolean; url: string | null }>(
          "cago.api.payment.vietqr",
          { amount: r.total, info: `Ban hang ${r.invoice}` },
          { method: "GET" },
        );
        setQr(v.url);
      }
    } catch (e) {
      await notify(`Không bán được: ${e instanceof Error ? e.message : "lỗi không rõ"}`, { danger: true });
    } finally {
      setBusy(false);
    }
  };

  const checkoutSplit = async () => {
    if (cartCodes.length === 0 || busy) return;
    const cashAmt = parseInt((splitCash || "").replace(/[^\d]/g, ""), 10) || 0;
    const bankAmt = parseInt((splitBank || "").replace(/[^\d]/g, ""), 10) || 0;
    const paid = cashAmt + bankAmt;
    if (paid <= 0) { await notify("Nhập số tiền tiền mặt và/hoặc chuyển khoản."); return; }
    if (paid < estimate && !cust) { await notify("Trả thiếu thì phải chọn khách (phần còn lại ghi nợ)."); return; }
    if (!guardShift(() => checkoutSplit())) return;
    const rest = estimate - paid;
    const msg = rest > 0 ? `Còn lại ${money(rest)} ghi nợ cho ${cust?.customer_name}.` : rest < 0 ? `Thối lại ${money(-rest)}.` : "";
    if (!(await ask(`Thu Tiền mặt ${money(cashAmt)} + Chuyển khoản ${money(bankAmt)}. ${msg} Xác nhận?`))) return;
    setBusy(true);
    try {
      const r = await frappeCall<SaleResult>("cago.api.sales.quick_sale", {
        items: cartCodes.map((c) => ({ item_code: c, qty: lines[c].qty, uom: lines[c].uom, rate: allowPriceEdit ? lines[c].rate : undefined })),
        customer: cust?.customer || null,
        discount_amount: disc || 0,
        coupon: coupon || undefined,
        payments: [
          { mode: "cash", amount: cashAmt },
          { mode: "bank", amount: bankAmt },
        ].filter((p) => p.amount > 0),
      });
      setResult(r);
      setShiftRefresh((n) => n + 1);
      setLines({});
      setDiscount("");
      clearCoupon();
      setSplitCash("");
      setSplitBank("");
      setShowSplit(false);
      setPayOpen(false);
      if (autoPrint) void printReceipt(r.invoice, paper);
    } catch (e) {
      await notify(`Không bán được: ${e instanceof Error ? e.message : "lỗi không rõ"}`, { danger: true });
    } finally {
      setBusy(false);
    }
  };

  // ---- result screen ----
  if (result) {
    return (
      <div className="text-center">
        <div className="rounded-2xl bg-white p-6 shadow">
          <div className="text-6xl">✅</div>
          <div className="mt-2 text-lg font-bold">Đã bán xong</div>
          <div className="mt-1 text-slate-500">
            {result.item_count} mặt hàng · {MODE_VI[result.payment_mode]}
          </div>
          <div className="mt-2 text-4xl font-extrabold text-brand">{result.total_text}</div>
          {result.outstanding_text && (
            <div className="mt-1 text-lg font-bold text-red-600">Khách đang nợ: {result.outstanding_text}</div>
          )}
          {result.change_text && (
            <div className="mt-1 text-lg font-bold text-brand">Thối lại: {result.change_text}</div>
          )}
          <div className="mt-1 text-sm text-slate-400">Hoá đơn {result.invoice}</div>
          {qr && (
            <div className="mt-4">
              <div className="text-slate-600">Khách quét mã để chuyển khoản:</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="VietQR" className="mx-auto mt-2 w-56 rounded-lg border" />
            </div>
          )}
        </div>
        <div className="mt-4">
          <PaperPicker paper={paper} onChange={setPaper} />
        </div>
        <button onClick={() => printReceipt(result.invoice, paper)} className="min-h-touch w-full rounded-2xl bg-slate-700 py-3.5 text-lg font-extrabold text-white">
          🖨 In hoá đơn
        </button>
        <button
          onClick={() => {
            setResult(null);
            setQr(null);
            setCust(null);
            void run(q.trim());
          }}
          className="mt-2.5 min-h-touch w-full rounded-2xl bg-brand py-4 text-xl font-extrabold text-white"
        >
          🛒 Bán đơn mới
        </button>
        <button onClick={() => router.push("/staff")} className="mt-2.5 min-h-touch w-full rounded-2xl bg-slate-200 py-3 text-lg font-bold">
          ← Trang chủ
        </button>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="mb-2.5 flex items-center gap-2.5">
        <button onClick={() => router.push("/staff")} className="rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ← Trang chủ
        </button>
        <div className="flex-1 text-2xl font-bold">BÁN HÀNG</div>
        <button onClick={openReprint} className="rounded-xl bg-slate-200 px-3 py-3 font-bold text-slate-700">
          🖨 In lại
        </button>
        {held.length > 0 && (
          <button onClick={() => setShowHeld((v) => !v)} className="rounded-xl bg-amber-500 px-3 py-3 font-bold text-white">
            🗂 Đơn giữ ({held.length})
          </button>
        )}
      </div>

      <ShiftBar refreshKey={shiftRefresh} onState={setShiftState} />

      {openShiftFor && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => { setOpenShiftFor(false); pendingPayRef.current = null; }}>
          <div className="w-full max-w-[420px] rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-xl font-extrabold text-emerald-800">🟢 Mở ca bán hàng</div>
            <p className="mt-1 text-sm text-slate-500">Cần mở ca trước khi bán. Đếm tiền mặt có sẵn trong két đầu ca (để cuối ca đối chiếu).</p>
            <label className="mt-3 block font-bold text-slate-700">Tiền mặt đầu ca</label>
            <input
              autoFocus
              inputMode="numeric"
              value={openCash}
              onChange={(e) => setOpenCash(fmtAmt(e.target.value))}
              placeholder="0"
              className="mt-1 w-full rounded-2xl border-2 border-emerald-300 p-3.5 text-2xl font-extrabold text-right"
            />
            <button onClick={confirmOpenShift} disabled={busy} className="mt-3 min-h-touch w-full rounded-2xl bg-brand py-3.5 text-lg font-extrabold text-white disabled:opacity-50">
              {busy ? "Đang mở ca..." : "Mở ca & bán tiếp"}
            </button>
            <button onClick={() => { setOpenShiftFor(false); pendingPayRef.current = null; }} className="mt-2 w-full rounded-xl bg-slate-100 py-2.5 font-bold text-slate-500">
              Để sau
            </button>
          </div>
        </div>
      )}

      {showReprint && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setShowReprint(false)}>
          <div className="no-scrollbar max-h-[85vh] w-full max-w-[560px] overflow-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xl font-bold">🖨 In lại hoá đơn</div>
              <button onClick={() => setShowReprint(false)} className="rounded-lg bg-slate-200 px-3 py-1.5 font-bold">Đóng</button>
            </div>
            <PaperPicker paper={paper} onChange={setPaper} />
            <input
              value={recentQ}
              onChange={(e) => setRecentQ(e.target.value)}
              placeholder="🔎 Tìm theo số hoá đơn / tên khách..."
              className="mb-2 w-full rounded-xl border-2 border-slate-300 p-3"
            />
            <div className="divide-y divide-slate-100">
              {recent
                .filter((s) => `${s.invoice} ${s.customer_name}`.toLowerCase().includes(recentQ.trim().toLowerCase()))
                .map((s) => (
                  <button
                    key={s.invoice}
                    onClick={() => printReceipt(s.invoice, paper)}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-bold">{s.customer_name}</div>
                      <div className="text-xs text-slate-400">{s.invoice} · {s.date_group} {s.time} · {s.item_count} món</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-brand">{s.total_text}</span>
                      <span className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-bold text-white">🖨 In</span>
                    </div>
                  </button>
                ))}
              {recent.length === 0 && <div className="py-6 text-center text-slate-400">Chưa có hoá đơn nào.</div>}
            </div>
          </div>
        </div>
      )}

      {keypad && (
        <Keypad
          label={list.find((p) => p.item_code === keypad)?.display_name || "Số lượng"}
          value={lines[keypad]?.qty ?? 0}
          uom={labelOf(keypad, lines[keypad]?.uom || "")}
          onClose={() => setKeypad(null)}
          onSet={(v) => setQty(keypad, v)}
        />
      )}

      {showHeld && held.length > 0 && (
        <div className="mb-2.5 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
          <div className="mb-1 font-bold text-amber-800">Đơn đang giữ</div>
          {held.map((h) => (
            <div key={h.id} className="flex items-center justify-between border-b border-amber-200 py-2 last:border-0">
              <span>
                <b>{h.cust ? h.cust.customer_name : "Khách lẻ"}</b> · {h.count} mặt hàng · {h.at}
              </span>
              <span className="flex gap-2">
                <button onClick={() => resumeOrder(h)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white">Mở lại</button>
                <button onClick={() => dropHeld(h.id)} className="rounded-lg bg-red-100 px-2 py-1.5 text-sm font-bold text-red-700">Xoá</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Customer bar */}
      <button
        onClick={() => setShowCust((v) => !v)}
        className="mb-2.5 flex w-full items-center justify-between rounded-xl border-2 border-slate-200 bg-white p-3 text-left"
      >
        <span className="font-bold">
          👤 {cust ? cust.customer_name : "Khách lẻ"}
          {cust?.outstanding_text && cust.outstanding_text !== "Không nợ" && (
            <span className="ml-2 text-sm font-bold text-red-600">(đang nợ {cust.outstanding_text})</span>
          )}
        </span>
        <span className="text-slate-400">{showCust ? "▲" : "đổi ▾"}</span>
      </button>
      {showCust && <CustomerPicker onPick={(c) => { setCust(c); setShowCust(false); }} onWalkIn={() => { setCust(null); setShowCust(false); }} />}

      {/* Search + barcode share one row on wider screens (stack on phones) — less vertical
          stacking so the products surface sooner. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            clearTimeout(tRef.current);
            tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
          }}
          placeholder="🔎 Tìm theo tên, công dụng... (để trống xem tất cả)"
          className="w-full rounded-xl border-2 border-slate-300 p-3.5 text-lg sm:flex-1"
        />
        <input
          placeholder="⌨ Quét/nhập mã vạch rồi Enter"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void findBarcode((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = "";
            }
          }}
          className="w-full rounded-xl border-2 border-emerald-300 p-3 text-base sm:w-72"
        />
      </div>

      <div className="mt-3">
        {/* One compact row: category chips (scrollable) + product count + List/Card toggle. */}
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            {cats.length > 0 && <CategoryNav variant="chips" cats={cats} active={category} onPick={pickCategory} />}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden whitespace-nowrap text-sm text-slate-400 sm:inline">{list.length} sản phẩm</span>
            <div className="flex shrink-0 overflow-hidden rounded-full border border-slate-300 bg-white">
              <button onClick={() => chooseView("list")} aria-label="Dạng danh sách" className={`px-3 py-1.5 text-lg ${viewMode === "list" ? "bg-brand text-white" : "text-slate-600"}`}>☰</button>
              <button onClick={() => chooseView("card")} aria-label="Dạng thẻ" className={`px-3 py-1.5 text-lg ${viewMode === "card" ? "bg-brand text-white" : "text-slate-600"}`}>▦</button>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="py-6 text-center text-slate-500">Đang tải...</div>
        ) : list.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tìm thấy sản phẩm.</div>
        ) : (
          <div className={`grid items-start gap-2.5 ${viewMode === "list" ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"}`}>
          {list.map((p) => {
            const line = lines[p.item_code];
            const m = meta[p.item_code];
            const multi = (m?.sale_units?.length || 0) > 1;
            return (
              <div key={p.item_code} className={`rounded-xl border-2 p-3 shadow-sm ${line ? "border-brand bg-brand-light/40" : "border-transparent bg-white"}`}>
                {viewMode === "card" ? (
                  // Card = vertical: thumb + info on top, a full-width Add button below (no cramped
                  // horizontal squeeze on a 2-column grid).
                  <div className="flex flex-col">
                    <div className="flex items-start gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg">
                        <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="thumb" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 font-bold leading-tight">{p.display_name}</div>
                        <div className="text-sm font-bold text-brand">{p.price_text}</div>
                        <div className={`text-xs ${cardOOS(p) ? "font-bold text-red-600" : "text-slate-400"}`}>
                          {cardOOS(p) ? "⚠ Hết hàng" : (m && `Còn ${trim(m.stock_qty)} ${m.stock_uom}`) || p.stock_status}
                        </div>
                      </div>
                    </div>
                    {!line && (
                      <button
                        onClick={() => add(p.item_code, p)}
                        className={`mt-3 min-h-touch w-full rounded-lg text-lg font-bold ${cardOOS(p) ? "border-2 border-red-300 bg-red-50 text-red-600" : "bg-brand text-white"}`}
                      >
                        {cardOOS(p) ? "Vẫn bán" : "＋ Thêm"}
                      </button>
                    )}
                  </div>
                ) : (
                  // List = compact horizontal row.
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                      <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="thumb" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 font-bold leading-tight">{p.display_name}</div>
                      <div className="text-sm font-bold text-brand">{p.price_text}</div>
                      <div className={`text-xs ${cardOOS(p) ? "font-bold text-red-600" : "text-slate-400"}`}>
                        {cardOOS(p) ? "⚠ Hết hàng" : (m && `Còn ${trim(m.stock_qty)} ${m.stock_uom}`) || p.stock_status}
                      </div>
                    </div>
                    {!line && (
                      <button
                        onClick={() => add(p.item_code, p)}
                        className={`h-11 shrink-0 rounded-lg px-4 text-lg font-bold ${cardOOS(p) ? "border-2 border-red-300 bg-red-50 text-red-600" : "bg-brand text-white"}`}
                      >
                        {cardOOS(p) ? "Vẫn bán" : "＋ Thêm"}
                      </button>
                    )}
                  </div>
                )}

                {line && (
                  <div className="mt-2.5 border-t border-brand/20 pt-2.5">
                    {lineOOS(p.item_code) && (
                      <div className="mb-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-sm font-bold text-red-600">⚠ Đang bán quá tồn (hệ thống còn 0)</div>
                    )}
                    {multi && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {m!.sale_units.map((u) => (
                          <button
                            key={u.uom}
                            onClick={() => setUom(p.item_code, u.uom)}
                            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${line.uom === u.uom ? "bg-brand text-white" : "bg-slate-200 text-slate-700"}`}
                          >
                            {(u.label || u.uom)} · {u.price_text}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <button onClick={() => setQty(p.item_code, line.qty - 1)} className="h-11 w-11 shrink-0 rounded-lg bg-slate-200 text-2xl font-bold">−</button>
                        <button
                          onClick={() => setKeypad(p.item_code)}
                          title="Bấm để nhập số lượng"
                          className="h-11 w-14 shrink-0 rounded-lg border-2 border-emerald-300 text-center text-xl font-extrabold"
                        >
                          {trim(line.qty)}
                        </button>
                        <button onClick={() => setQty(p.item_code, line.qty + 1)} className="h-11 w-11 shrink-0 rounded-lg bg-brand text-2xl font-bold text-white">＋</button>
                        <span className="truncate text-slate-500">{labelOf(p.item_code, line.uom)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-extrabold text-brand">{money(linePrice(p.item_code) * line.qty)}</span>
                        <button onClick={() => setQty(p.item_code, 0)} className="rounded-lg bg-red-50 px-2.5 py-1 text-sm font-bold text-red-600">Bỏ</button>
                      </div>
                    </div>
                    {allowPriceEdit && (
                      <div className="mt-2 flex items-center justify-end gap-2 text-sm">
                        <span className="text-slate-500">Đơn giá:</span>
                        <input
                          inputMode="numeric"
                          value={line.rate != null ? line.rate.toLocaleString("vi-VN") : ""}
                          onChange={(e) => setRate(p.item_code, e.target.value)}
                          placeholder={fmtAmt(String(unitPrice(p.item_code, line.uom)))}
                          className={`h-9 w-28 rounded-lg border-2 px-2 text-right font-bold ${line.rate != null ? "border-amber-400 bg-amber-50" : "border-slate-300"}`}
                        />
                        <span className="text-slate-400">/ {labelOf(p.item_code, line.uom)}</span>
                        {line.rate != null && (
                          <button onClick={() => setRate(p.item_code, "")} className="text-amber-700 underline">gốc {money(unitPrice(p.item_code, line.uom))}</button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        )}
        {/* Infinite-scroll sentinel + loading hint (server paginates 30/page). */}
        {hasMore && <div ref={sentinelRef} className="h-1" />}
        {loadingMore && <div className="py-4 text-center text-slate-400">Đang tải thêm...</div>}
      </div>

      {cartCodes.length > 0 && (
        <>
          {/* Dim the page when the payment panel is open so it reads as a deliberate sheet. */}
          {payOpen && <div className="fixed inset-0 z-10 bg-black/30" onClick={() => setPayOpen(false)} aria-hidden />}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
            <div className="mx-auto max-w-[960px]">
              {!payOpen ? (
                // COLLAPSED — one slim row. Keeps the product list visible so staff can keep
                // searching/adding; tap to open the full payment panel only when ready.
                <button onClick={() => setPayOpen(true)} className="flex w-full items-center justify-between gap-3 p-3 text-left">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-500">
                      🛒 {cartCodes.length} mặt hàng{cust ? ` · ${cust.customer_name}` : ""}
                    </span>
                    <span className="text-2xl font-extrabold text-brand">{money(estimate)}</span>
                  </span>
                  <span className="shrink-0 rounded-xl bg-brand px-5 py-3 text-lg font-extrabold text-white">Thanh toán ▲</span>
                </button>
              ) : (
                <div className="no-scrollbar max-h-[82vh] overflow-auto p-3">
                  <button onClick={() => setPayOpen(false)} className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-2 font-bold text-slate-500">
                    ▼ Thu gọn — chọn thêm hàng
                  </button>
                  {/* Customer — changeable right here so staff don't have to scroll up to ghi nợ. */}
                  <button
                    onClick={() => setCustInPanel((v) => !v)}
                    className="mb-2 flex w-full items-center justify-between rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-left"
                  >
                    <span className="font-bold">
                      👤 {cust ? cust.customer_name : "Khách lẻ"}
                      {cust?.outstanding_text && cust.outstanding_text !== "Không nợ" && (
                        <span className="ml-2 text-sm font-bold text-red-600">(đang nợ {cust.outstanding_text})</span>
                      )}
                    </span>
                    <span className="text-slate-400">{custInPanel ? "▲" : "đổi ▾"}</span>
                  </button>
                  {custInPanel && (
                    <div className="mb-2">
                      <CustomerPicker
                        onPick={(c) => { setCust(c); setCustInPanel(false); }}
                        onWalkIn={() => { setCust(null); setCustInPanel(false); }}
                      />
                    </div>
                  )}
                  {/* Count + a single collapsible Giảm giá/Mã (most sales have no discount, so it
                      stays out of the way; auto-opens when a discount/coupon is already applied). */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-500">{cartCodes.length} mặt hàng</span>
                    <button
                      onClick={() => setDiscOpen((v) => !v)}
                      className={`rounded-lg border-2 px-3 py-1.5 text-sm font-bold ${disc + couponDisc > 0 ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-300 text-slate-600"}`}
                    >
                      🏷️ Giảm giá / Mã{disc + couponDisc > 0 ? ` · −${money(disc + couponDisc)}` : discOpen || disc + couponDisc > 0 ? " ▲" : " ▾"}
                    </button>
                  </div>
                  {(discOpen || disc + couponDisc > 0 || !!coupon) && (
                    <div className="mt-2 space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-600">Giảm trực tiếp</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            inputMode="numeric"
                            value={discount}
                            onChange={(e) => setDiscount(fmtAmt(e.target.value))}
                            placeholder="0"
                            className="h-9 w-20 rounded-lg border-2 border-amber-300 px-2 text-right"
                          />
                          <div className="flex overflow-hidden rounded-lg border-2 border-amber-300 text-sm font-bold">
                            <button onClick={() => setDiscountMode("amount")} className={discountMode === "amount" ? "bg-amber-500 px-2.5 py-1.5 text-white" : "bg-white px-2.5 py-1.5 text-amber-700"}>đ</button>
                            <button onClick={() => setDiscountMode("percent")} className={discountMode === "percent" ? "bg-amber-500 px-2.5 py-1.5 text-white" : "bg-white px-2.5 py-1.5 text-amber-700"}>%</button>
                          </div>
                        </div>
                      </div>
                      {discountMode === "percent" && disc > 0 && <div className="text-right text-xs text-amber-700">= giảm {money(disc)}</div>}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600">🎟 Mã</span>
                        <input
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                          placeholder="Nhập mã giảm giá"
                          className="h-9 min-w-0 flex-1 rounded-lg border-2 border-violet-300 px-2 uppercase"
                        />
                        {coupon ? (
                          <button onClick={clearCoupon} className="shrink-0 rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-bold">Bỏ</button>
                        ) : (
                          <button onClick={applyCoupon} className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-bold text-white">Áp dụng</button>
                        )}
                      </div>
                      {couponMsg && <div className="text-right text-xs">{couponMsg}</div>}
                    </div>
                  )}
                  {/* Total — the number to confirm: prominent, boxed, right above the pay buttons. */}
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-light/60 px-3.5 py-3">
                    <div>
                      <div className="text-sm font-bold text-slate-500">Tổng tiền</div>
                      {disc + couponDisc > 0 && <div className="text-xs font-bold text-amber-700">đã giảm {money(disc + couponDisc)}</div>}
                    </div>
                    <span className="text-3xl font-extrabold text-brand">{money(estimate)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
              <button onClick={() => checkout("cash")} disabled={busy} className="min-h-touch rounded-xl bg-brand py-3.5 text-lg font-extrabold text-white disabled:opacity-50">
                💵 Tiền mặt
              </button>
              <button onClick={() => checkout("bank")} disabled={busy} className="min-h-touch rounded-xl bg-violet-600 py-3.5 text-lg font-extrabold text-white disabled:opacity-50">
                💳 C.khoản
              </button>
              <button
                onClick={() => checkout("credit")}
                disabled={busy || !cust}
                title={!cust ? "Chọn khách để ghi nợ" : ""}
                className="min-h-touch rounded-xl bg-red-600 py-3.5 text-lg font-extrabold text-white disabled:opacity-40"
              >
                📝 Ghi nợ
              </button>
            </div>
            <button onClick={() => setShowSplit((v) => !v)} className="mt-2 w-full rounded-xl border-2 border-slate-300 bg-white py-2.5 font-bold text-slate-700">
              ➗ Tách / trả một phần {showSplit ? "▲" : "▾"}
            </button>
            {showSplit && (
              <div className="mt-2 rounded-xl border-2 border-slate-200 p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm font-bold text-slate-600">
                    💵 Tiền mặt
                    <input inputMode="numeric" value={splitCash} onChange={(e) => setSplitCash(fmtAmt(e.target.value))} placeholder="0" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2 text-right" />
                  </label>
                  <label className="text-sm font-bold text-slate-600">
                    💳 Chuyển khoản
                    <input inputMode="numeric" value={splitBank} onChange={(e) => setSplitBank(fmtAmt(e.target.value))} placeholder="0" className="mt-1 w-full rounded-lg border-2 border-violet-300 p-2 text-right" />
                  </label>
                </div>
                {(() => {
                  const paid = (parseInt(splitCash.replace(/[^\d]/g, ""), 10) || 0) + (parseInt(splitBank.replace(/[^\d]/g, ""), 10) || 0);
                  const rest = estimate - paid;
                  return (
                    <div className="mt-1.5 text-center text-sm font-bold">
                      {rest > 0 ? <span className="text-red-600">Còn lại ghi nợ: {money(rest)}{!cust && " (cần chọn khách)"}</span> : rest < 0 ? <span className="text-brand">Thối lại: {money(-rest)}</span> : <span className="text-brand">Đủ tiền ✓</span>}
                    </div>
                  );
                })()}
                <button onClick={checkoutSplit} disabled={busy} className="mt-2 min-h-touch w-full rounded-xl bg-brand py-3 text-lg font-extrabold text-white disabled:opacity-50">
                  ✅ Hoàn tất (nhiều hình thức)
                </button>
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button onClick={holdOrder} disabled={busy} className="flex-1 rounded-xl border-2 border-amber-400 bg-white py-2.5 font-bold text-amber-700 disabled:opacity-50">
                🗂 Giữ đơn
              </button>
              <label className="flex items-center gap-1.5 rounded-xl border-2 border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-600">
                <input
                  type="checkbox"
                  checked={autoPrint}
                  onChange={(e) => {
                    setAutoPrint(e.target.checked);
                    window.localStorage?.setItem("cago_pos_autoprint", e.target.checked ? "1" : "0");
                  }}
                  className="h-5 w-5"
                />
                Tự in phiếu
              </label>
            </div>
                  {!cust && <div className="mt-1 text-center text-xs text-slate-400">Muốn ghi nợ? Bấm 👤 Khách lẻ ở trên để chọn khách.</div>}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CustomerPicker({ onPick, onWalkIn }: { onPick: (c: Cust) => void; onWalkIn: () => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Cust[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", village: "" });
  const [busy, setBusy] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = async (query: string) => {
    try {
      setRows((await frappeCall<Cust[]>("cago.api.sales.search_customers_lite", { query }, { method: "GET" })) || []);
    } catch {
      setRows([]);
    }
  };
  useEffect(() => {
    void run("");
  }, []);

  const create = async () => {
    if (busy) return;
    if (!form.name.trim()) { await alertDialog("Nhập tên khách."); return; }
    setBusy(true);
    try {
      const r = await frappeCall<{ customer: string; customer_name: string }>("cago.api.sales.add_customer_lite", {
        customer_name: form.name.trim(),
        phone: form.phone.trim(),
        village: form.village.trim(),
      });
      onPick({ customer: r.customer, customer_name: r.customer_name, outstanding_text: "Không nợ" });
    } catch (e) {
      await alertDialog(`Lỗi: ${e instanceof Error ? e.message : "không tạo được khách."}`, { danger: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-2.5 rounded-xl border-2 border-brand/30 bg-white p-3">
      {adding ? (
        <div>
          <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tên khách *" className="mb-2 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Số điện thoại (tùy chọn)" className="mb-2 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <input value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} placeholder="Xóm/thôn (tùy chọn)" className="mb-2 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <div className="flex gap-2">
            <button onClick={create} disabled={busy} className="flex-1 rounded-lg bg-brand py-2.5 font-bold text-white disabled:opacity-50">Lưu khách</button>
            <button onClick={() => setAdding(false)} className="rounded-lg bg-slate-200 px-4 font-bold">Quay lại</button>
          </div>
        </div>
      ) : (
        <div>
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              clearTimeout(tRef.current);
              tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
            }}
            placeholder="Tìm khách theo tên / SĐT..."
            className="w-full rounded-lg border-2 border-slate-300 p-2.5"
          />
          <button onClick={onWalkIn} className="mt-2 w-full rounded-lg bg-slate-100 py-2 text-left font-bold text-slate-600">👤 Khách lẻ (không ghi nợ)</button>
          <div className="no-scrollbar mt-1 max-h-56 overflow-auto">
            {rows.map((c) => (
              <button key={c.customer} onClick={() => onPick(c)} className="flex w-full items-center justify-between border-b border-slate-100 py-2 text-left">
                <span>
                  <b>{c.customer_name}</b>
                  <span className="text-slate-500"> {c.village || ""} {c.mobile ? `· ${c.mobile}` : ""}</span>
                </span>
                <span className={`text-sm font-bold ${c.outstanding_text && c.outstanding_text !== "Không nợ" ? "text-red-600" : "text-slate-400"}`}>{c.outstanding_text}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setAdding(true)} className="mt-2 w-full rounded-lg bg-teal-600 py-2.5 font-bold text-white">➕ Thêm khách mới</button>
        </div>
      )}
    </div>
  );
}

// Till shift (S7): per-cashier drawer accountability wired into the sell flow. Open with a
// starting float, sell, then count the drawer at close and see expected vs counted.
interface ShiftState {
  open: boolean;
  opened_at?: string;
  opening_text?: string;
  cash_sales_text?: string;
  expected?: number;
  expected_text?: string;
}
interface CloseResult {
  expected_text: string;
  counted_text: string | null;
  diff_text: string;
  match: boolean | null;
  over: boolean;
  cash_sales_text: string;
  opening_text: string;
  payouts_text: string;
}
const num = (s: string) => parseInt((s || "").replace(/[^\d]/g, ""), 10) || 0;

function ShiftBar({ refreshKey, onState }: { refreshKey: number; onState?: (open: boolean) => void }) {
  const [shift, setShift] = useState<ShiftState | null>(null);
  const [mode, setMode] = useState<"none" | "open" | "close">("none");
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [payouts, setPayouts] = useState("");
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<CloseResult | null>(null);

  const apply = (s: ShiftState) => {
    setShift(s);
    onState?.(!!s.open);
  };
  const load = async () => {
    try {
      apply(await frappeCall<ShiftState>("cago.api.shift.current_shift", {}, { method: "GET" }));
    } catch {
      apply({ open: false });
    }
  };
  // Reload on mount AND after each sale (refreshKey bumps) so the running "tiền mặt bán" and the
  // close-shift "dự kiến" preview stay current instead of showing the figure from page load.
  useEffect(() => {
    void load();
  }, [refreshKey]);

  const doOpen = async () => {
    if (busy) return;
    setBusy(true);
    try {
      apply(await frappeCall<ShiftState>("cago.api.shift.open_shift", { opening_cash: num(opening) }));
      setMode("none");
      setOpening("");
    } catch (e) {
      await alertDialog(`Lỗi: ${e instanceof Error ? e.message : "không mở được ca."}`, { danger: true });
    } finally {
      setBusy(false);
    }
  };
  const doClose = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await frappeCall<CloseResult>("cago.api.shift.close_shift", { counted_cash: num(counted), payouts: num(payouts) });
      setClosed(r);
      setMode("none");
      setCounted("");
      setPayouts("");
      await load();
    } catch (e) {
      await alertDialog(`Lỗi: ${e instanceof Error ? e.message : "không đóng được ca."}`, { danger: true });
    } finally {
      setBusy(false);
    }
  };

  if (!shift) return null;
  return (
    <div className="mb-2.5">
      {!shift.open ? (
        <button onClick={() => setMode("open")} className="w-full rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50 py-2.5 font-bold text-emerald-700">
          🟢 Mở ca bán hàng (đếm tiền đầu ca)
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-2.5">
          <div className="min-w-0 text-sm">
            <div className="font-bold text-emerald-800">🟢 Ca mở {shift.opened_at}</div>
            <div className="text-emerald-700">Đầu ca {shift.opening_text} · Tiền mặt bán {shift.cash_sales_text}</div>
          </div>
          <button onClick={() => setMode("close")} className="shrink-0 rounded-lg bg-red-600 px-3 py-2 font-bold text-white">🔴 Đóng ca</button>
        </div>
      )}

      {mode === "open" && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setMode("none")}>
          <div className="w-full max-w-[380px] rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-xl font-bold">🟢 Mở ca</div>
            <label className="block font-bold text-slate-600">Tiền mặt có sẵn trong két (đầu ca)</label>
            <input autoFocus inputMode="numeric" value={opening} onChange={(e) => setOpening(fmtAmt(e.target.value))} placeholder="0" className="mt-1 w-full rounded-xl border-2 border-emerald-300 p-3 text-right text-2xl font-extrabold" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setMode("none")} className="flex-1 rounded-xl bg-slate-200 py-3 font-bold">Huỷ</button>
              <button onClick={doOpen} disabled={busy} className="flex-[2] rounded-xl bg-emerald-600 py-3 text-lg font-extrabold text-white disabled:opacity-50">Mở ca</button>
            </div>
          </div>
        </div>
      )}

      {mode === "close" && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setMode("none")}>
          <div className="w-full max-w-[380px] rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 text-xl font-bold">🔴 Đóng ca · đếm két</div>
            <div className="mb-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
              Đầu ca {shift.opening_text} + Tiền mặt bán {shift.cash_sales_text} = <b>dự kiến {shift.expected_text}</b>
            </div>
            <label className="block font-bold text-slate-600">Chi ra trong ca (nếu có)</label>
            <input inputMode="numeric" value={payouts} onChange={(e) => setPayouts(fmtAmt(e.target.value))} placeholder="0" className="mt-1 w-full rounded-xl border-2 border-amber-300 p-2.5 text-right font-bold" />
            <label className="mt-2 block font-bold text-slate-600">Đếm tiền mặt thực tế trong két</label>
            <input autoFocus inputMode="numeric" value={counted} onChange={(e) => setCounted(fmtAmt(e.target.value))} placeholder="0" className="mt-1 w-full rounded-xl border-2 border-emerald-300 p-3 text-right text-2xl font-extrabold" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setMode("none")} className="flex-1 rounded-xl bg-slate-200 py-3 font-bold">Huỷ</button>
              <button onClick={doClose} disabled={busy} className="flex-[2] rounded-xl bg-red-600 py-3 text-lg font-extrabold text-white disabled:opacity-50">Đóng ca</button>
            </div>
          </div>
        </div>
      )}

      {closed && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setClosed(null)}>
          <div className="w-full max-w-[380px] rounded-2xl bg-white p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl">{closed.match ? "✅" : closed.over ? "📈" : "📉"}</div>
            <div className="mt-1 text-xl font-bold">{closed.match ? "Khớp két!" : closed.over ? "Thừa tiền" : "Thiếu tiền"}</div>
            {!closed.match && <div className={`text-2xl font-extrabold ${closed.over ? "text-emerald-600" : "text-red-600"}`}>{closed.over ? "+" : "−"}{closed.diff_text}</div>}
            <div className="mt-3 space-y-1 text-left text-sm text-slate-600">
              <div className="flex justify-between"><span>Tiền đầu ca</span><b>{closed.opening_text}</b></div>
              <div className="flex justify-between"><span>Tiền mặt bán được</span><b>{closed.cash_sales_text}</b></div>
              <div className="flex justify-between"><span>Chi ra trong ca</span><b>{closed.payouts_text}</b></div>
              <div className="flex justify-between border-t pt-1"><span>Dự kiến trong két</span><b>{closed.expected_text}</b></div>
              <div className="flex justify-between"><span>Đếm thực tế</span><b>{closed.counted_text}</b></div>
            </div>
            <button onClick={() => setClosed(null)} className="mt-4 w-full rounded-xl bg-brand py-3 text-lg font-extrabold text-white">Xong</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Paper-size chooser for the receipt printer; remembered in localStorage across sales.
function PaperPicker({ paper, onChange }: { paper: PaperSize; onChange: (p: PaperSize) => void }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-sm font-bold text-slate-500">Khổ giấy:</span>
      {(Object.keys(PAPER) as PaperSize[]).map((k) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`rounded-lg px-3 py-1.5 text-sm font-bold ${paper === k ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-700"}`}
        >
          {PAPER[k].label}
        </button>
      ))}
    </div>
  );
}

// On-screen number pad for quantity entry — lets a tablet at the counter (no keyboard) set
// quantities quickly with big touch targets. Edits a draft, commits on "Xong".
function Keypad({ label, value, uom, onClose, onSet }: { label: string; value: number; uom: string; onClose: () => void; onSet: (v: number) => void }) {
  const [draft, setDraft] = useState(String(trim(value)));
  const press = (k: string) => {
    if (k === "⌫") return setDraft((d) => (d.length <= 1 ? "0" : d.slice(0, -1)));
    if (k === ".") return setDraft((d) => (d.includes(".") ? d : d + "."));
    setDraft((d) => (d === "0" ? k : d + k));
  };
  const commit = () => {
    const v = parseFloat(draft.replace(",", "."));
    onSet(Number.isFinite(v) ? v : 0);
    onClose();
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-[380px] rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 truncate text-center font-bold">{label}</div>
        <div className="mb-3 rounded-xl border-2 border-emerald-300 p-3 text-center text-3xl font-extrabold">
          {draft} <span className="text-lg text-slate-400">{uom}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <button key={k} onClick={() => press(k)} className="min-h-[56px] rounded-xl bg-slate-100 text-2xl font-bold active:bg-slate-200">
              {k}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl bg-slate-200 py-3 font-bold">Huỷ</button>
          <button onClick={commit} className="flex-[2] rounded-xl bg-brand py-3 text-lg font-extrabold text-white">Xong</button>
        </div>
      </div>
    </div>
  );
}
