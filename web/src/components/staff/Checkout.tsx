"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FrappeError, frappeCall } from "@/lib/api";
import { useSession } from "@/lib/session";
import { CategoryNav } from "@/components/ui/CategoryNav";
import { BarcodeScanner } from "@/components/ui/BarcodeScanner";
import { CatThumb } from "@/components/kiosk/CatThumb";
import { ProductInfo } from "@/components/staff/ProductDetail";
import { confirmDialog } from "@/components/ui/dialog";
import { ConfirmDebt, type DebtProof } from "@/components/pos/ConfirmDebt";
import { toast } from "@/components/ui/toast";
import { uomLabel } from "@/lib/uom";
import { Spinner } from "@/components/ui/Loading";
import { formatVnd, groupVnd, parseVnd } from "@/lib/utils";
import { BackBar, StockBadge } from "@/components/owner/Shared";
import type { ProductCard, Product, Category, Batch } from "@/lib/types";
import { useOnline } from "@/lib/offline/useOnline";
import { type SaleArgs, type SaleDisplay } from "@/lib/offline/db";
import { findByBarcodeLocal, getProductLocal, refreshCatalog, searchCatalogLocal, searchCustomersLocal, spendCachedPoints } from "@/lib/offline/catalog";
import { enqueueSale, newClientUuid, queueCounts } from "@/lib/offline/queue";
import { flushQueue } from "@/lib/offline/sync";
import { cfdPost } from "@/lib/cfd";
import { printReceipt } from "@/lib/receipt";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { SkeletonRows } from "@/components/ui/Skeleton";

type PayMode = "cash" | "bank" | "credit" | "split";
interface SaleResult {
  invoice: string;
  total: number;
  total_text: string;
  payment_mode: PayMode;
  item_count: number;
  customer_name?: string;
  lines?: { name: string; qty: number; uom: string; amount_text: string }[];
  outstanding_text?: string | null;
  paid_text?: string | null;
  cash_text?: string | null;
  bank_text?: string | null;
  change_text?: string | null;
  offline?: boolean; // queued offline — `invoice` holds the provisional local code, not a server no.
}
interface Cust {
  customer: string;
  customer_name: string;
  village?: string;
  mobile?: string;
  points?: number;
  outstanding_text?: string;
}
interface Meta {
  name: string; // display name — so the in-panel cart can list items not in the current search view
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

// One shared VND helper set (lib/utils) so owner/staff/kiosk render & parse money identically.
const money = formatVnd;
const fmtAmt = groupVnd;
const parsePrice = parseVnd;
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
  discount?: string;
  discountMode?: "amount" | "percent";
  redeemPts?: number;
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
// The ACTIVE (unfinished) cart, auto-saved so an accidental back / refresh doesn't lose it.
const DRAFT_KEY = "cago_active_cart";

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


// Provisional receipt for an OFFLINE sale — printed straight from the queued cart (no server call,
// which would fail with no network). Clearly marked "CHƯA ĐỒNG BỘ"; the real invoice prints later.
function printProvisional(
  store: string,
  localCode: string,
  lines: { name: string; qty: number; uom: string; rate_text: string; amount_text: string }[],
  totalText: string,
  outstandingText: string | null,
  size: PaperSize = loadPaper(),
) {
  const w = window.open("", "_blank", "width=380,height=640");
  const p = PAPER[size];
  const rows = lines
    .map((l) => `<div class="it"><div>${esc(l.name)}</div><div class="r">${trim(l.qty)} ${esc(uomLabel(l.uom))} x ${l.rate_text} = <b>${l.amount_text}</b></div></div>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(localCode)}</title>
  <style>@page{size:${p.page};margin:${size === "a5" ? "8mm" : "2mm"}}body{width:${p.width};font-family:monospace;font-size:${p.base};color:#000}
  h3{text-align:center;margin:2px 0}.c{text-align:center}.it{border-bottom:1px dashed #999;padding:2px 0}.r{font-size:${p.line}}
  .tot{font-weight:bold;font-size:${p.tot};text-align:right;margin-top:4px}.tmp{text-align:center;border:1px dashed #000;margin:3px 0;padding:2px;font-weight:bold}</style>
  </head><body>
  <h3>${esc(store)}</h3>
  <div class="c">PHIẾU BÁN HÀNG (TẠM)</div>
  <div class="tmp">⚠ CHƯA ĐỒNG BỘ — ${esc(localCode)}</div>
  <hr>${rows}
  <div class="tot">TỔNG: ${esc(totalText)}</div>
  ${outstandingText ? `<div class="r">Còn nợ: ${esc(outstandingText)}</div>` : ""}
  <div class="c" style="margin-top:6px">Cảm ơn quý khách!</div>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`;
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

// Only lots that still have stock are ever shown/used (sold-out lots are hidden) — matches the
// server's FEFO, which also ignores empty lots.
function inStockLots(lots: Batch[]) {
  return lots.filter((b) => (b.qty ?? 0) > 0);
}
const lotSum = (a?: Record<string, number>) => Object.values(a || {}).reduce((s, q) => s + (q || 0), 0);
// FEFO distribution of `qty` across in-stock lots (server order is already nearest-expiry first):
// fill each lô up to its on-hand, spill the rest to the next; any oversell remainder on the last lô.
// (Counts shown in the lô's own unit — exact for single-unit batch goods, the usual case.)
function fefoFill(lots: Batch[], qty: number): Record<string, number> {
  // Fill each lô only up to its real on-hand (never invent stock): the sum caps at total available.
  // If qty exceeds the total, the shortfall is surfaced as "vượt tồn" — not piled onto a lô.
  const out: Record<string, number> = {};
  let need = qty;
  for (const b of inStockLots(lots)) {
    if (need <= 1e-9) break;
    const take = Math.min(b.qty ?? 0, need);
    if (take > 0) out[b.batch] = take;
    need -= take;
  }
  return out;
}

// Lot handling for a batch-tracked line in the cart. Default = FEFO (auto split across lots,
// nearest-expiry first), so "đang bán lô nào" is shown and the server fills the next lô when the
// first runs short. "Chia lô" lets staff set how many from each lô (e.g. customer won't take the
// near-expiry one, or wants 2+2). Sold-out lots never appear.
function LotPicker({
  code, lineQty, manual, alloc, onLoaded, onToggleManual, onSetAlloc,
}: {
  code: string;
  lineQty: number;
  manual: boolean;
  alloc: Record<string, number>;
  onLoaded: (code: string, lots: Batch[]) => void;
  onToggleManual: (code: string, on: boolean, lots: Batch[]) => void;
  onSetAlloc: (code: string, batch: string, qty: number) => void;
}) {
  const [lots, setLots] = useState<Batch[] | null>(null);
  useEffect(() => {
    let alive = true;
    frappeCall<Batch[]>("cago.api.inventory.list_batches", { item_code: code }, { method: "GET" })
      .then((l) => { if (!alive) return; const arr = l || []; setLots(arr); onLoaded(code, arr); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  const shown = inStockLots(lots || []);
  if (!shown.length) return null; // offline or no in-stock lot → server auto-FEFO; nothing to show

  const totalQty = shown.reduce((s, b) => s + (b.qty ?? 0), 0);
  const over = lineQty > totalQty + 1e-6; // selling more than all lots hold
  const overWarn = over ? (
    <div className="mt-1 rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-600">⚠ Vượt tồn — chỉ còn {trim(totalQty)}, đang bán {trim(lineQty)} (thiếu {trim(lineQty - totalQty)}). Giảm số lượng hoặc nhập thêm hàng.</div>
  ) : null;

  if (!manual) {
    // Show every in-stock lô with how much it has left, and how many of each the FEFO split will
    // sell (nearest-expiry first, spilling to the next) — staff sees total + per-lô + what's sold.
    const auto = fefoFill(shown, lineQty);
    return (
      <div className="mt-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-500">🏷 Lô · tổng còn {trim(totalQty)} · bán tự động</span>
          {shown.length > 1 && (
            <button onClick={() => onToggleManual(code, true, shown)} className="rounded-lg border border-slate-300 px-2 py-0.5 font-bold text-slate-600">Chia lô</button>
          )}
        </div>
        <div className="mt-0.5 space-y-0.5">
          {shown.map((b) => (
            <div key={b.batch} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-slate-600">{b.batch_id}{b.expiry_text ? ` · HSD ${b.expiry_text}` : ""} <span className="text-slate-400">· còn {trim(b.qty)}</span></span>
              {(auto[b.batch] || 0) > 0 && <span className="shrink-0 font-bold text-brand">bán {trim(auto[b.batch])}</span>}
            </div>
          ))}
        </div>
        {overWarn}
      </div>
    );
  }

  const sum = lotSum(alloc);
  return (
    <div className="mt-1.5 rounded-lg border border-slate-200 p-2">
      <div className="mb-1 flex items-center justify-between text-xs font-bold">
        <span className={over ? "text-red-600" : "text-slate-500"}>🏷 Chia lô · tổng còn {trim(totalQty)} · đang bán {trim(sum)}</span>
        <button onClick={() => onToggleManual(code, false, shown)} className="text-slate-500 underline">Tự động</button>
      </div>
      <div className="space-y-1">
        {shown.map((b) => {
          const max = b.qty ?? 0; // can't allocate more from a lô than it has on hand
          const cur = alloc[b.batch] || 0;
          const atMax = cur >= max;
          return (
              <div key={b.batch} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{b.batch_id}{b.expiry_text ? ` · HSD ${b.expiry_text}` : ""} <span className="text-slate-400">(còn {trim(max)})</span></span>
                <button onClick={() => onSetAlloc(code, b.batch, Math.max(0, cur - 1))} className="h-9 w-9 shrink-0 rounded bg-slate-200 text-xl font-bold">−</button>
                <input
                  inputMode="numeric"
                  value={String(trim(cur))}
                  onChange={(e) => onSetAlloc(code, b.batch, Math.min(max, Math.max(0, Number(e.target.value.replace(/[^\d.]/g, "")) || 0)))}
                  onFocus={(e) => e.target.select()}
                  className="h-9 w-14 shrink-0 rounded border-2 border-emerald-300 text-center text-base font-bold"
                />
                <button
                  onClick={() => onSetAlloc(code, b.batch, Math.min(max, cur + 1))}
                  disabled={atMax}
                  className={`h-9 w-9 shrink-0 rounded text-xl font-bold text-white ${atMax ? "bg-slate-300" : "bg-brand"}`}
                >
                  ＋
                </button>
              </div>
          );
        })}
      </div>
      {overWarn}
    </div>
  );
}

export function Checkout() {
  const router = useRouter();
  const sp = useSearchParams();
  const wantedParam = sp.get("wanted"); // pre-load a kiosk wanted-list into the cart for payment
  const [wantedCode, setWantedCode] = useState<string | null>(null);
  const { boot } = useSession();
  const online = useOnline(); // false → search/cart read the IndexedDB cache; sales are queued
  // /staff/sell is shared by staff AND the owner ("🛒 Bán hàng" tile) — send "back/home" to the
  // caller's real home so an owner doesn't get dumped on the staff home.
  const home = "/pos"; // unified back-office home
  const allowPriceEdit = !!boot?.allow_price_edit; // server re-checks; this only shows the field
  const [list, setList] = useState<ProductCard[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchSeq = useRef(0); // monotonic token: ignore out-of-order search responses
  const STAFF_PAGE = 30;
  // Headroom: hide the search/category bar on scroll-down (more room for products), reveal it
  // instantly on scroll-up — so staff find/filter without scrolling to the very top.
  const [showTop, setShowTop] = useState(false); // back-to-top FAB after scrolling down
  const [camOpen, setCamOpen] = useState(false); // camera barcode scanner overlay (opened from the search box 📷)
  useEffect(() => {
    let ticking = false;
    const apply = () => {
      ticking = false;
      const y = Math.max(0, window.scrollY);
      setShowTop(y > 600);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  // Per-lô handling for batch-tracked goods. Default = auto FEFO (no manual alloc → server splits
  // nearest-expiry first). "Chia lô" lets staff set qty per lô (sent as batch_allocs when the split
  // matches the line qty, else the server auto-FEFOs).
  const [lotManual, setLotManual] = useState<Record<string, boolean>>({});
  const [lotAlloc, setLotAlloc] = useState<Record<string, Record<string, number>>>({});
  const onLotsLoaded = () => {};
  const toggleLotManual = (code: string, on: boolean, lots: Batch[]) => {
    setLotManual((s) => ({ ...s, [code]: on }));
    if (on) {
      // Seed with the real FEFO split (fill nearest-expiry lô, spill to next) so it starts correct
      // (e.g. lô1 ×100, lô2 ×21) — not all on one lô — then staff tweaks. Line total = its sum.
      const seeded = fefoFill(lots, lines[code]?.qty || 0);
      setLotAlloc((s) => ({ ...s, [code]: seeded }));
      const sum = Object.values(seeded).reduce((a, b) => a + (b || 0), 0);
      setLines((l) => (l[code] ? { ...l, [code]: { ...l[code], qty: sum } } : l));
    } else {
      setLotAlloc((s) => { const c = { ...s }; delete c[code]; return c; });
    }
  };
  const setLotAllocQty = (code: string, batch: string, qty: number) => {
    const next = { ...(lotAlloc[code] || {}), [batch]: qty };
    setLotAlloc((s) => ({ ...s, [code]: next }));
    // In split mode the lô quantities ARE the source of truth → the line total follows their sum.
    const sum = Object.values(next).reduce((a, b) => a + (b || 0), 0);
    setLines((l) => (l[code] ? { ...l, [code]: { ...l[code], qty: sum } } : l));
  };
  const [cust, setCust] = useState<Cust | null>(null); // null = Khách lẻ
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaleResult | null>(null);
  // When the current result is an offline (queued) sale, keep its display so the result screen can
  // reprint the provisional receipt without a server round-trip.
  const [offlineSale, setOfflineSale] = useState<{ code: string; lines: SaleDisplay["lines"]; total_text: string; outstanding: string | null } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [held, setHeld] = useState<Held[]>([]);
  const [preview, setPreview] = useState<string | null>(null); // product being previewed (tap image/title)
  const [showHeld, setShowHeld] = useState(false);
  const [discount, setDiscount] = useState("");
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [redeemPts, setRedeemPts] = useState(0); // loyalty points the customer spends this sale
  const [delivery, setDelivery] = useState(""); // optional delivery fee (phí giao hàng) added to the bill
  const [custInPanel, setCustInPanel] = useState(false); // change-customer picker inside the pay panel
  const [viewMode, setViewMode] = useState<"list" | "card">("list"); // staff default = dense list (speed)
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null); // applied code
  const [couponDisc, setCouponDisc] = useState(0);
  const [couponMsg, setCouponMsg] = useState<React.ReactNode>(null);
  const [discOpen, setDiscOpen] = useState(false); // collapsible discount/coupon section in the pay panel
  // App-wide styled confirm/alert (see components/ui/dialog).
  const ask = confirmDialog;
  // Debt-acknowledgement capture for a credit sale (mua chịu) — promise-based so checkout() reads
  // linearly. The modal resolves with the proof, null (skipped), or false (cancelled).
  const [proofCtx, setProofCtx] = useState<number | null>(null);
  const proofResolver = useRef<((p: DebtProof | null | false) => void) | null>(null);
  const captureDebtProof = (amount: number) =>
    new Promise<DebtProof | null | false>((resolve) => {
      proofResolver.current = resolve;
      setProofCtx(amount);
    });
  const resolveProof = (p: DebtProof | null | false) => {
    setProofCtx(null);
    proofResolver.current?.(p);
    proofResolver.current = null;
  };
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
  const [payClosing, setPayClosing] = useState(false); // play the slide-down before unmounting
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
    const seq = ++searchSeq.current; // newest wins; a slow earlier response won't clobber this one
    setLoading(true);
    try {
      const r = (online
        ? await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query, category: cat || null, start: 0 }, { method: "GET" })
        : ((await searchCatalogLocal(query, cat || null, 0, STAFF_PAGE)) as ProductCard[])) || [];
      if (seq !== searchSeq.current) return; // a newer search started — drop this stale result
      setList(r);
      setHasMore(r.length >= STAFF_PAGE);
    } catch {
      if (seq !== searchSeq.current) return;
      setList([]);
      setHasMore(false);
    } finally {
      if (seq === searchSeq.current) setLoading(false);
    }
  };
  // Infinite scroll: fetch the next page and append (server paginates by `start`).
  const loadMore = async () => {
    if (loadingMore || loading) return;
    const seq = searchSeq.current; // tie this page to the current search; a new run() invalidates it
    const start = list.length;
    setLoadingMore(true);
    try {
      const r = (online
        ? await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query: q, category: category || null, start }, { method: "GET" })
        : ((await searchCatalogLocal(q, category || null, start, STAFF_PAGE)) as ProductCard[])) || [];
      if (seq !== searchSeq.current) return; // search changed mid-flight — don't append to a new list
      setList((prev) => [...prev, ...r]);
      setHasMore(r.length >= STAFF_PAGE);
    } catch {
      if (seq === searchSeq.current) setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };
  useEffect(() => {
    void run("");
    frappeCall<Category[]>("cago.api.staff.list_categories", {}, { method: "GET" }).then((d) => setCats(d || [])).catch(() => {});
    // Warm the offline cache + drain any backlog whenever the sell screen opens online.
    if (online) {
      void refreshCatalog().catch(() => {});
      void flushQueue().catch(() => {});
    }
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
      const p = online
        ? await frappeCall<Product>("cago.api.staff.get_product", { item_code: code }, { method: "GET" })
        : ((await getProductLocal(code)) as Product | undefined);
      if (!p) return null;
      const m: Meta = {
        name: p.display_name || code,
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
  // Exact on-hand for the shelf: "Còn N <đơn vị>" when tracked, else the manual status text.
  const stockText = (p: ProductCard, m?: Meta) => {
    if (cardOOS(p)) return "⚠ Hết hàng";
    const qty = p.stock_auto && p.actual_stock_qty != null ? p.actual_stock_qty : m?.stock_auto ? m.stock_qty : null;
    if (qty == null) return p.stock_status || "";
    return `Còn ${trim(qty)} ${uomLabel(m?.stock_uom || p.unit || "")}`.trim();
  };
  // Near-expiry flag on lot-tracked items (backend only sets it for those) — so staff push the
  // soon-to-expire lô first. Amber = sắp hết hạn, red = đã hết hạn.
  const expFlag = (p: ProductCard) =>
    p.expiry_status === "near" || p.expiry_status === "expired" ? (
      <div className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${p.expiry_status === "expired" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
        {p.expiry_status === "expired" ? "⛔ Đã hết hạn" : "⏳ Sắp hết hạn"}{p.expiry_text ? ` · ${p.expiry_text}` : ""}
      </div>
    ) : null;
  const lineOOS = (code: string) => {
    const m = meta[code];
    return !!m?.stock_auto && (m.stock_qty ?? 0) <= 0;
  };

  const add = async (code: string, card?: ProductCard) => {
    // Warn up-front instead of failing at payment: out-of-stock is sellable (back-order) but
    // the staff must confirm so it's never a surprise. Negative stock is allowed server-side.
    // (Barcode scans pass no card → no warning, since scanning implies the item is in hand.)
    if (card && cardOOS(card)) {
      // Per-item policy: only items flagged allow_oversell may be sold negative; others are blocked.
      if (!card.allow_oversell) {
        toast.error(`"${card.display_name}" đang hết hàng — mặt hàng này không bán quá tồn. Hãy Nhập hàng trước.`);
        return;
      }
      if (!(await ask(`"${card.display_name}" đang hết hàng trên hệ thống. Vẫn bán (bán âm tồn)?`, { danger: true, confirmLabel: "Vẫn bán" }))) return;
    }
    const m = await ensureMeta(code);
    // Block items with no price ("Liên hệ"): otherwise the line is 0đ and the sale completes free.
    // Allow if ANY sale unit is priced (multi-unit items may price by Yến/Tạ, not the base UOM).
    const priced = (m?.sale_units || []).some((s) => parsePrice(s.price_text) > 0) || parsePrice(card?.price_text || "") > 0;
    if (!priced) {
      toast.error("Sản phẩm chưa có giá bán. Nhờ chủ cửa hàng đặt giá trước khi bán.");
      return;
    }
    setLines((l) => (l[code] ? l : { ...l, [code]: { qty: 1, uom: m?.stock_uom || "" } }));
  };
  // Pre-load a kiosk wanted-list into the cart (from "/pos/sell?wanted=CODE") so staff collect
  // payment in the Cago POS instead of being dumped into the raw ERPNext desk invoice.
  useEffect(() => {
    if (!wantedParam) return;
    let cancelled = false;
    (async () => {
      try {
        const wl = await frappeCall<{ items: { item_code: string; qty: number }[] }>(
          "cago.api.staff.get_wanted_list",
          { code: wantedParam },
          { method: "GET" },
        );
        for (const it of wl.items || []) {
          if (cancelled) return;
          const m = await ensureMeta(it.item_code);
          setLines((l) => ({ ...l, [it.item_code]: { qty: it.qty || 1, uom: l[it.item_code]?.uom || m?.stock_uom || "" } }));
        }
        if (!cancelled) setWantedCode(wantedParam);
      } catch {
        /* invalid code → ignore, staff sells normally */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedParam]);
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
    meta[code]?.sale_units.find((s) => s.uom === uom)?.label || uomLabel(uom);
  // Display name for a cart line — works even if the item isn't in the current search view.
  const nameOf = (code: string) => meta[code]?.name || list.find((p) => p.item_code === code)?.display_name || code;
  // Price actually charged for a line: manual override (if owner allows + set) else price-list rate.
  const linePrice = (code: string) => lines[code]?.rate ?? unitPrice(code, lines[code]?.uom ?? "");
  const cartCodes = Object.keys(lines);
  const subtotal = cartCodes.reduce((s, c) => s + linePrice(c) * lines[c].qty, 0);

  // Auto-save / restore the active cart so an accidental "‹ Trang chủ" or browser-back (then
  // return) never loses the selection. sessionStorage = lives for the till session, cleared on a
  // completed/held sale. Restore runs once post-mount (SSR-safe); a ?wanted= deep-link wins.
  const restored = useRef(false);
  useEffect(() => {
    if (wantedParam) { restored.current = true; return; }
    try {
      const raw = window.sessionStorage?.getItem(DRAFT_KEY);
      const d = raw ? JSON.parse(raw) : null;
      if (d?.lines && Object.keys(d.lines).length) {
        setLines(d.lines);
        if (d.cust) setCust(d.cust);
        if (d.discount) setDiscount(d.discount);
        if (d.discountMode) setDiscountMode(d.discountMode);
        if (d.coupon) { setCoupon(d.coupon); setCouponInput(d.coupon); }
        if (d.redeemPts) setRedeemPts(d.redeemPts); // clamped to balance at use via redeemUse
        Object.keys(d.lines).forEach((c) => void ensureMeta(c)); // re-load names/prices for the rows
      }
    } catch { /* ignore a corrupt draft */ }
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!restored.current) return; // don't clobber the saved draft with the empty initial render
    try {
      if (cartCodes.length) window.sessionStorage?.setItem(DRAFT_KEY, JSON.stringify({ lines, cust, discount, discountMode, coupon, redeemPts }));
      else window.sessionStorage?.removeItem(DRAFT_KEY); // empty cart (incl. after a completed/held sale) → drop it
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, cust, discount, discountMode, coupon, redeemPts]);
  const discountNum = parseInt((discount || "").replace(/[^\d]/g, ""), 10) || 0;
  // Discount can be a fixed đồng amount or a % of the subtotal (rural staff say "bớt 10%").
  const discRaw = discountMode === "percent" ? Math.round((subtotal * Math.min(discountNum, 100)) / 100) : discountNum;
  const disc = Math.max(0, Math.min(discRaw, subtotal));
  // Loyalty redemption: customer spends points (đồng each = boot.loyalty_redeem_vnd), capped by
  // their balance and by what's left of the bill after other discounts.
  const redeemVnd = boot?.loyalty_redeem_vnd || 1000;
  // A coupon is validated/counted server-side, so it can only be honoured online; offline we drop
  // it from the payload (buildSale), so it must ALSO be excluded from the shown/printed total —
  // otherwise the provisional receipt would undercharge vs. the invoice the server later books.
  const effCouponDisc = online ? couponDisc : 0;
  const maxRedeem = Math.min(cust?.points || 0, Math.floor(Math.max(0, subtotal - disc - effCouponDisc) / redeemVnd));
  const redeemUse = Math.max(0, Math.min(redeemPts, maxRedeem));
  const redeemDisc = redeemUse * redeemVnd; // đồng knocked off the bill by spent points
  const estimate = Math.max(0, subtotal - disc - effCouponDisc - redeemDisc);
  // Delivery fee is a flat add-on to what the customer pays (not discountable). payTotal = the amount
  // due; `estimate` stays the goods-after-discount figure used by the discount/redeem maths.
  const deliveryNum = parseInt((delivery || "").replace(/[^\d]/g, ""), 10) || 0;
  const payTotal = estimate + deliveryNum;
  const totalSaved = disc + effCouponDisc + redeemDisc; // everything knocked off the subtotal

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
  // Collapse the pay panel with a slide-down (play the exit animation, then unmount).
  const closePay = () => {
    setPayClosing(true);
    setTimeout(() => {
      setPayClosing(false);
      setPayOpen(false);
    }, 200);
  };
  // After a wanted-list sale completes, mark it Completed so it leaves the staff's open queue.
  const markWantedDone = () => {
    if (!wantedCode) return;
    void frappeCall("cago.api.staff.set_wanted_list_status", { code: wantedCode, status: "Completed" }).catch(() => {});
    setWantedCode(null);
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
      const itemCode = online
        ? (await frappeCall<{ item_code: string | null }>("cago.api.catalog.find_by_barcode", { barcode: code.trim() }, { method: "GET" })).item_code
        : await findByBarcodeLocal(code.trim());
      if (itemCode) await add(itemCode);
      else toast.info("Không tìm thấy sản phẩm với mã vạch này.");
    } catch {
      toast.error("Không tra được mã vạch.");
    }
  };

  const holdOrder = () => {
    if (cartCodes.length === 0) return;
    const h: Held = {
      id: String(Date.now()),
      at: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      cust,
      lines,
      meta,
      count: cartCodes.length,
      discount,
      discountMode,
      redeemPts,
    };
    const next = [h, ...held];
    setHeld(next);
    saveHeld(next);
    // Reset the WHOLE bargaining state so it can't bleed onto the next customer's fresh cart.
    setLines({});
    setCust(null);
    setDiscount("");
    setDiscountMode("amount");
    setRedeemPts(0);
    clearCoupon();
    setPayOpen(false);
  };
  const resumeOrder = (h: Held) => {
    setLines(h.lines);
    setMeta((m) => ({ ...m, ...h.meta }));
    setCust(h.cust);
    setDiscount(h.discount || "");
    setDiscountMode(h.discountMode || "amount");
    setRedeemPts(h.redeemPts || 0);
    const next = held.filter((x) => x.id !== h.id);
    setHeld(next);
    saveHeld(next);
    setShowHeld(false);
  };
  const dropHeld = async (id: string) => {
    if (!(await ask("Xoá đơn đang giữ này? (không khôi phục được)", { danger: true, confirmLabel: "Xoá" }))) return;
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
      toast.error(`Lỗi: ${e instanceof Error ? e.message : "không mở được ca."}`);
    } finally {
      setBusy(false);
    }
  };

  // Build the quick_sale payload + a display snapshot (for the receipt / pending list) from the cart.
  const buildSale = (payment_mode: PayMode, payments?: { mode: "cash" | "bank"; amount: number }[]): { args: SaleArgs; display: SaleDisplay } => {
    const items = cartCodes.map((c) => {
      // Send a manual lô split only when it exactly matches the line qty; otherwise let the server
      // auto-FEFO (nearest-expiry lô first, spilling to the next).
      const a = lotAlloc[c];
      const useAlloc = lotManual[c] && a && Math.abs(lotSum(a) - lines[c].qty) < 1e-6;
      const batch_allocs = useAlloc ? Object.entries(a).filter(([, q]) => (q || 0) > 0).map(([batch, qty]) => ({ batch, qty })) : undefined;
      return { item_code: c, qty: lines[c].qty, uom: lines[c].uom, rate: allowPriceEdit ? lines[c].rate : undefined, batch_allocs };
    });
    const dispLines = cartCodes.map((c) => {
      const price = linePrice(c);
      return { name: nameOf(c), qty: lines[c].qty, uom: labelOf(c, lines[c].uom), rate_text: money(price), amount_text: money(price * lines[c].qty) };
    });
    const args: SaleArgs = {
      items,
      payment_mode,
      customer: cust?.customer || null,
      discount_amount: disc || 0,
      coupon: online ? coupon || undefined : undefined, // coupons need server validation → online only
      redeem_points: redeemUse || 0,
      delivery_charge: deliveryNum || undefined,
      ...(payments ? { payments } : {}),
    };
    const display: SaleDisplay = { customer_name: cust?.customer_name, total_text: money(payTotal), item_count: cartCodes.length, payment_mode, lines: dispLines };
    return { args, display };
  };

  // On a wide PC screen the pay panel becomes a cart docked on the right (always open, no
  // bottom sheet); on phone/tablet it stays the slide-up sheet. desktop drives that switch.
  const desktop = useIsDesktop();
  const panelOpen = payOpen || desktop; // docked cart on PC is always "expanded"
  useLockBodyScroll(payOpen && !desktop); // sheet locks scroll; docked cart must not
  // Removing the last line (✕) empties the cart, which UNMOUNTS the whole pay sheet + its overlay —
  // but payOpen stayed true, so the body-scroll lock never released and the page froze (no overlay
  // left to tap "close"). Reset payOpen the moment the cart goes empty so the lock always lifts.
  useEffect(() => {
    if (cartCodes.length === 0 && payOpen) setPayOpen(false);
  }, [cartCodes.length, payOpen]);

  // Mirror the live cart to the customer-facing display (/pos/display) — only name/qty/line total +
  // the grand total (never cost). Posts an idle "welcome" when the cart empties.
  useEffect(() => {
    if (!cartCodes.length) { cfdPost({ type: "idle" }); return; }
    cfdPost({
      type: "cart",
      lines: cartCodes.map((c) => ({ name: nameOf(c), qty: lines[c].qty, amount_text: money(linePrice(c) * lines[c].qty) })),
      total_text: money(payTotal),
      saved_text: totalSaved > 0 ? money(totalSaved) : undefined,
      customer_name: cust?.customer_name,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, payTotal, totalSaved, cust]);
  // Show the payment QR big on the customer display while it's up.
  useEffect(() => {
    if (qr) cfdPost({ type: "qr", url: qr, amount_text: money(payTotal) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr]);

  // Reset the cart + pay panel after a sale (online or queued).
  const clearCart = () => {
    setLines({});
    setMeta({}); // drop cached stock so the next sale re-reads fresh on-hand (no stale OOS banner)
    setDiscount("");
    setDiscountMode("amount"); // reset đ/% so a "%" mode doesn't bleed into the next customer's discount
    setRedeemPts(0);
    setDelivery("");
    clearCoupon();
    setSplitCash("");
    setSplitBank("");
    setShowSplit(false);
    setPayOpen(false);
  };

  // Ring up a sale with no network: store it in the queue and show a provisional receipt. The
  // server books it (deduping on client_uuid) once the connection returns.
  const queueOffline = async (payment_mode: PayMode, args: SaleArgs, display: SaleDisplay, outstanding: string | null, clientUuid?: string) => {
    const sale = await enqueueSale(args, display, clientUuid);
    // Spend the redeemed points in the local cache so a 2nd offline sale to this customer can't redeem
    // the same points again (server re-clamps on sync; this keeps the provisional total honest).
    if (args.customer && (args.redeem_points || 0) > 0) await spendCachedPoints(args.customer, args.redeem_points || 0);
    setOfflineSale({ code: sale.local_code, lines: display.lines, total_text: display.total_text, outstanding });
    setResult({
      invoice: sale.local_code,
      total: 0,
      total_text: display.total_text,
      payment_mode,
      item_count: display.item_count,
      customer_name: display.customer_name,
      lines: display.lines.map((l) => ({ name: l.name, qty: l.qty, uom: l.uom, amount_text: l.amount_text })),
      outstanding_text: outstanding,
      offline: true,
    });
    setShiftRefresh((n) => n + 1);
    markWantedDone();
    clearCart();
    if (autoPrint) printProvisional(boot?.brand || "Cửa hàng", sale.local_code, display.lines, display.total_text, outstanding, paper);
    toast.success(`Đã lưu phiếu tạm ${sale.local_code} — sẽ tự đồng bộ khi có mạng.`);
  };

  const checkout = async (payment_mode: PayMode) => {
    if (cartCodes.length === 0 || busy) return;
    if (payment_mode === "credit" && !cust) {
      toast.error("Chọn khách hàng để ghi nợ (bấm vào ô khách ở trên).");
      return;
    }
    if (!online && payment_mode === "bank") {
      toast.error("Chuyển khoản cần mạng. Hãy chọn Tiền mặt hoặc Ghi nợ.");
      return;
    }
    if (!guardShift(() => checkout(payment_mode))) return;
    const who = cust ? ` cho ${cust.customer_name}` : "";
    if (!(await ask(`${MODE_VI[payment_mode]} ${cartCodes.length} mặt hàng · ${money(payTotal)}${who}?`, { confirmLabel: MODE_VI[payment_mode] }))) return;
    // Bán chịu (credit) → capture the customer's debt acknowledgement (ký/ảnh/người chứng) when the
    // owner's policy is on. Works offline too: the proof rides the queued sale and uploads on sync.
    let debtProof: DebtProof | null = null;
    const dpol = boot?.debt_proof?.debt;
    if (payment_mode === "credit" && dpol && dpol.mode !== "off") {
      const r = await captureDebtProof(payTotal);
      if (r === false) return; // cancelled
      debtProof = r;
    }
    setBusy(true);
    // One idempotency key for this attempt: sent on the online call AND reused if it falls back to
    // the queue, so a sale the server already booked (response lost) is never double-booked.
    const cuid = newClientUuid();
    const { args: baseArgs, display } = buildSale(payment_mode);
    // Fold the proof into the sale args so it travels the SAME way online and offline (sync.ts
    // re-sends args verbatim → the server creates the proof when the queued credit sale flushes).
    const args = debtProof
      ? { ...baseArgs, debt_signature: debtProof.signature || undefined, debt_photo: debtProof.photo || undefined, debt_witness: debtProof.witness || undefined }
      : baseArgs;
    const outstanding = payment_mode === "credit" ? display.total_text : null;
    try {
      if (!online) {
        await queueOffline(payment_mode, args, display, outstanding, cuid);
        return;
      }
      const r = await frappeCall<SaleResult>("cago.api.sales.quick_sale", { ...args, client_uuid: cuid });
      setResult(r);
      setOfflineSale(null);
      setShiftRefresh((n) => n + 1);
      markWantedDone();
      clearCart();
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
      // "Transient" = the network dropped OR the server briefly couldn't answer (5xx/429, e.g. mid-deploy
      // or a lost response). In BOTH cases the sale MAY have landed, so re-ringing with a fresh uuid could
      // double-book. Queue the cash/credit sale with the SAME client_uuid → the retry dedups server-side
      // (no double charge) and the sale is never lost. Bank needs the live gateway so it can't be queued —
      // tell staff to CHECK "Đơn gần đây" before re-ringing rather than blindly retry.
      const transient = !(e instanceof FrappeError) || e.status >= 500 || e.status === 429;
      if (transient && payment_mode !== "bank") {
        await queueOffline(payment_mode, args, display, outstanding, cuid);
        toast.success("Mạng/máy chủ trục trặc — đã LƯU đơn vào hàng chờ, sẽ tự đồng bộ. Đừng bán lại đơn này.");
        return;
      }
      if (transient && payment_mode === "bank") {
        toast.error("Máy chủ trục trặc. Mở 'Đơn gần đây' kiểm tra đơn đã lên chưa rồi mới bán lại (tránh trùng).");
        return;
      }
      toast.error(`Không bán được: ${e instanceof Error ? e.message : "lỗi không rõ"}`);
    } finally {
      setBusy(false);
    }
  };

  const checkoutSplit = async () => {
    if (cartCodes.length === 0 || busy) return;
    // Split payment uses chuyển khoản → needs the gateway. Not available offline.
    if (!online) {
      toast.error("Trả nhiều hình thức cần mạng. Khi mất mạng hãy bán Tiền mặt hoặc Ghi nợ.");
      return;
    }
    const cashAmt = parseInt((splitCash || "").replace(/[^\d]/g, ""), 10) || 0;
    const bankAmt = parseInt((splitBank || "").replace(/[^\d]/g, ""), 10) || 0;
    const paid = cashAmt + bankAmt;
    if (paid <= 0) { toast.error("Nhập số tiền tiền mặt và/hoặc chuyển khoản."); return; }
    if (paid < payTotal && !cust) { toast.error("Trả thiếu thì phải chọn khách (phần còn lại ghi nợ)."); return; }
    if (!guardShift(() => checkoutSplit())) return;
    const rest = payTotal - paid;
    const msg = rest > 0 ? `Còn lại ${money(rest)} ghi nợ cho ${cust?.customer_name}.` : rest < 0 ? `Thối lại ${money(-rest)}.` : "";
    if (!(await ask(`Thu Tiền mặt ${money(cashAmt)} + Chuyển khoản ${money(bankAmt)}. ${msg} Xác nhận?`))) return;
    // The shortfall (rest > 0) is debt → capture the acknowledgement for that amount, like a credit sale.
    let debtProof: DebtProof | null = null;
    const dpol = boot?.debt_proof?.debt;
    if (rest > 0 && dpol && dpol.mode !== "off") {
      const r = await captureDebtProof(rest);
      if (r === false) return; // cancelled
      debtProof = r;
    }
    setBusy(true);
    const splitPayments = [
      { mode: "cash" as const, amount: cashAmt },
      { mode: "bank" as const, amount: bankAmt },
    ].filter((p) => p.amount > 0);
    const { args: baseArgs } = buildSale("split", splitPayments);
    const args = debtProof
      ? { ...baseArgs, debt_signature: debtProof.signature || undefined, debt_photo: debtProof.photo || undefined, debt_witness: debtProof.witness || undefined }
      : baseArgs;
    const cuid = newClientUuid(); // dedup a manual re-ring if the response was lost mid-checkout
    try {
      const r = await frappeCall<SaleResult>("cago.api.sales.quick_sale", { ...args, client_uuid: cuid });
      setResult(r);
      setOfflineSale(null);
      setShiftRefresh((n) => n + 1);
      markWantedDone();
      clearCart();
      if (autoPrint) void printReceipt(r.invoice, paper);
    } catch (e) {
      // Split has a bank leg → can't be queued. On a transient error the sale may have landed, so warn
      // (don't let staff blind-re-ring with a fresh uuid = double-book); only show the raw error on a
      // genuine business rejection.
      const transient = !(e instanceof FrappeError) || e.status >= 500 || e.status === 429;
      toast.error(
        transient
          ? "Máy chủ trục trặc. Mở 'Đơn gần đây' kiểm tra đơn đã lên chưa rồi mới bán lại (tránh trùng)."
          : `Không bán được: ${e instanceof Error ? e.message : "lỗi không rõ"}`,
      );
    } finally {
      setBusy(false);
    }
  };

  // ---- result screen ----
  if (result) {
    return (
      <div className="text-center">
        <div className="rounded-2xl bg-white p-6 shadow">
          <div className="text-6xl">{result.offline ? "📴" : "✅"}</div>
          <div className="mt-2 text-lg font-bold">{result.offline ? "Đã lưu phiếu tạm" : "Đã bán xong"}</div>
          {result.offline && (
            <div className="mx-auto mt-2 max-w-sm rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              ⚠ Chưa đồng bộ — sẽ tự lên hệ thống khi có mạng
            </div>
          )}
          <div className="mt-2 text-4xl font-extrabold text-brand">{result.total_text}</div>
          <div className="mt-1 text-slate-500">
            {MODE_VI[result.payment_mode]}
            {result.customer_name && ` · 👤 ${result.customer_name}`}
          </div>
          {/* What was sold */}
          {result.lines && result.lines.length > 0 && (
            <div className="mx-auto mt-3 max-w-sm border-t border-slate-100 pt-3 text-left">
              {result.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-2 py-0.5 text-sm">
                  <span className="min-w-0 truncate text-slate-600">
                    {l.name} <span className="text-slate-400">× {l.qty} {uomLabel(l.uom)}</span>
                  </span>
                  <span className="shrink-0 font-bold text-slate-700">{l.amount_text}</span>
                </div>
              ))}
            </div>
          )}
          {/* Payment breakdown */}
          {result.payment_mode === "split" && (result.cash_text || result.bank_text) && (
            <div className="mt-2 text-sm text-slate-500">
              Đã trả: {[result.cash_text && `💵 ${result.cash_text}`, result.bank_text && `💳 ${result.bank_text}`].filter(Boolean).join(" · ")}
            </div>
          )}
          {result.outstanding_text && result.outstanding_text !== "Không nợ" && (
            <div className="mt-1 text-lg font-bold text-red-600">Khách đang nợ: {result.outstanding_text}</div>
          )}
          {result.change_text && (
            <div className="mt-1 text-lg font-bold text-brand">Thối lại: {result.change_text}</div>
          )}
          <div className="mt-2 text-xs text-slate-400">{result.offline ? "Phiếu tạm" : "Hoá đơn"} {result.invoice}</div>
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
        <button
          onClick={() =>
            result.offline && offlineSale
              ? printProvisional(boot?.brand || "Cửa hàng", offlineSale.code, offlineSale.lines, offlineSale.total_text, offlineSale.outstanding, paper)
              : printReceipt(result.invoice, paper)
          }
          className="min-h-touch w-full rounded-2xl bg-slate-700 py-3.5 text-lg font-extrabold text-white"
        >
          🖨 {result.offline ? "In phiếu tạm" : "In hoá đơn"}
        </button>
        <button
          onClick={() => {
            setResult(null);
            setOfflineSale(null);
            setQr(null);
            setCust(null);
            void run(q.trim());
          }}
          className="mt-2.5 min-h-touch w-full rounded-2xl bg-brand py-4 text-xl font-extrabold text-white"
        >
          🛒 Bán đơn mới
        </button>
        <button onClick={() => router.push(home)} className="mt-2.5 min-h-touch w-full rounded-2xl bg-slate-200 py-3 text-lg font-bold">
          ‹ Trang chủ
        </button>
      </div>
    );
  }

  return (
    // PC (xl): two columns — products left, the cart/pay panel docked right. Phone/tablet: one
    // column with the slide-up pay sheet (pb-24 leaves room for the fixed bottom bar).
    <div className="pb-24 xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start xl:gap-6 xl:pb-4">
      {/* Shared green app-bar. On PC it spans BOTH columns (col-span-2) so it reads as a proper full-width
          top bar. On phone it's `display:contents` so the sticky BackBar's containing block is the TALL
          page div (not this short wrapper) — otherwise sticky had no room and the header scrolled away,
          only reappearing at the very top. */}
      <div className="contents xl:block xl:col-span-2">
        <BackBar
          title="BÁN HÀNG"
          right={
            <>
              <button onClick={openReprint} aria-label="In lại" className="shrink-0 rounded-xl bg-white/20 px-3 py-2 font-bold text-white">🖨</button>
              {held.length > 0 && (
                <button onClick={() => setShowHeld((v) => !v)} className="shrink-0 rounded-xl bg-amber-300 px-3 py-2 font-bold text-amber-900">🗂 {held.length}</button>
              )}
            </>
          }
        />
      </div>
      <div className="min-w-0">
      <ShiftBar refreshKey={shiftRefresh} onState={setShiftState} cashier={boot?.full_name} />

      {openShiftFor && (
        <div className="fixed inset-0 z-40 flex animate-fade-in items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => { setOpenShiftFor(false); pendingPayRef.current = null; }}>
          <div className="w-full max-w-[420px] animate-sheet-up rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
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
        <div className="fixed inset-0 z-30 flex animate-fade-in items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setShowReprint(false)}>
          <div className="no-scrollbar max-h-[85vh] w-full max-w-[560px] animate-sheet-up overflow-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xl font-bold">🖨 In lại hoá đơn</div>
              <button onClick={() => setShowReprint(false)} className="rounded-lg bg-slate-200 px-3 py-1.5 font-bold">Đóng</button>
            </div>
            <PaperPicker paper={paper} onChange={setPaper} />
            <input
              value={recentQ}
              onChange={(e) => setRecentQ(e.target.value)}
              enterKeyHint="search" placeholder="🔎 Tìm theo số hoá đơn / tên khách..."
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
                      <span aria-label="In" className="rounded-lg bg-slate-700 px-3 py-2 text-base font-bold text-white">🖨</span>
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

      {/* Camera barcode scanner — stays open for scan-add-scan; each decode adds via findBarcode. */}
      {camOpen && <BarcodeScanner title="Quét thêm vào giỏ" onScan={(c) => void findBarcode(c)} onClose={() => setCamOpen(false)} />}

      {preview && (
        <ProductPreview
          code={preview}
          line={lines[preview] || null}
          qtyText={lines[preview] ? String(trim(lines[preview].qty)) : ""}
          unitLabel={lines[preview] ? labelOf(preview, lines[preview].uom) : ""}
          onClose={() => setPreview(null)}
          onAdd={() => add(preview, list.find((x) => x.item_code === preview))}
          onInc={() => setQty(preview, (lines[preview]?.qty || 0) + 1)}
          onDec={() => setQty(preview, (lines[preview]?.qty || 0) - 1)}
          onRemove={() => setQty(preview, 0)}
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

      {/* Customer is chosen inside the payment panel (with the cart + ghi nợ), so the sell screen
          stays focused on finding products — no duplicate customer control up here. */}

      {/* Sticky headroom bar: search + barcode + category chips stay reachable while scrolling
          (hide on scroll-down, reveal on scroll-up) so staff needn't scroll to the top. */}
      {/* Not sticky: the shared BackBar above is the sticky/green top bar (keeps the status bar green);
          two stacked sticky bars used to collide and leak a sliver. This toolbar scrolls with the list
          and is back the moment you scroll up. */}
      <div className="-mx-4 mb-3 bg-[#eef9f0]/95 px-4 py-2">
        {/* ONE "find a product" box: type a name / code to filter, or scan a barcode. A hardware
            USB/BT scanner just types the (all-digit) barcode + Enter → resolves & adds the item;
            tapping 📷 opens the phone-camera scanner. Merged from the old separate search + "Mã vạch"
            toggle + second field so the row stays uncluttered (common POS pattern). */}
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              clearTimeout(tRef.current);
              tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
            }}
            onKeyDown={(e) => {
              // All-digit query on Enter = a scanned/typed barcode → add it; a name search does nothing
              // special (so Enter on "cám cò" never shows a false "barcode not found").
              if (e.key === "Enter" && /^\d{6,}$/.test(q.trim())) {
                clearTimeout(tRef.current); // cancel the pending text-search for the barcode digits
                void findBarcode(q.trim());
                setQ("");
              }
            }}
            enterKeyHint="search" placeholder="🔎 Tìm tên · mã · mã vạch…"
            className="min-w-0 flex-1 rounded-xl border-2 border-slate-300 p-3.5 text-lg"
          />
          {/* Camera as a SEPARATE box beside the input (not overlapping it) + type=button +
              onMouseDown preventDefault → one tap opens the scanner even while the box has focus. */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setCamOpen(true)}
            aria-label="Quét mã vạch bằng camera"
            className="shrink-0 rounded-xl bg-emerald-600 px-4 text-2xl text-white"
          >
            📷
          </button>
        </div>
        {/* Category chips get their OWN full-width row so they never get clipped by the toggle. */}
        {cats.length > 0 && (
          <div className="mt-2">
            <CategoryNav variant="chips" cats={cats} active={category} onPick={pickCategory} />
          </div>
        )}
        {/* Product count + List/Card toggle on a slim row below (no longer squeezing the chips). */}
        <div className="mt-2 flex items-center justify-between">
          <span className="whitespace-nowrap text-sm text-slate-400">{list.length} sản phẩm</span>
          <div className="flex shrink-0 overflow-hidden rounded-full border border-slate-300 bg-white">
            <button onClick={() => chooseView("list")} aria-label="Dạng danh sách" className={`px-3.5 py-1.5 text-lg ${viewMode === "list" ? "bg-brand text-white" : "text-slate-600"}`}>☰</button>
            <button onClick={() => chooseView("card")} aria-label="Dạng thẻ" className={`px-3.5 py-1.5 text-lg ${viewMode === "card" ? "bg-brand text-white" : "text-slate-600"}`}>▦</button>
          </div>
        </div>
      </div>

      <div>
        {loading ? (
          <SkeletonRows rows={6} />
        ) : list.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center text-slate-400">
            {q.trim() || category ? "Không tìm thấy sản phẩm. Thử gõ tên khác." : "Gõ tên sản phẩm hoặc chọn loại hàng để xem."}
          </div>
        ) : (
          <div className={`grid gap-2.5 ${viewMode === "list" ? "grid-cols-1 items-start" : "grid-cols-2 items-stretch lg:grid-cols-3 2xl:grid-cols-4"}`}>
          {list.map((p) => {
            const line = lines[p.item_code];
            const m = meta[p.item_code];
            const multi = (m?.sale_units?.length || 0) > 1;
            return (
              <div key={p.item_code} className={`flex h-full flex-col rounded-xl border-2 p-3 shadow-sm ${line ? "border-brand bg-brand-light/40" : "border-transparent bg-white"}`}>
                {viewMode === "card" ? (
                  // Card = standard mobile product card: IMAGE ON TOP (full-width square), text below,
                  // a full-width Add button pinned to the bottom (mt-auto) so card buttons line up.
                  <div className="flex flex-1 flex-col">
                    <button onClick={() => setPreview(p.item_code)} aria-label="Xem chi tiết" className="relative mb-2 block aspect-square w-full overflow-hidden rounded-lg bg-slate-50">
                      <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="thumb" />
                      {(p.best_seller || p.recommended) && (
                        <span className="absolute left-1 top-1 rounded-md bg-black/55 px-1.5 py-0.5 text-xs">{p.best_seller ? "🏆" : ""}{p.recommended ? "⭐" : ""}</span>
                      )}
                      <span className="absolute bottom-1 right-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[11px] text-white">🔍</span>
                    </button>
                    <button onClick={() => setPreview(p.item_code)} className="line-clamp-2 text-left font-bold leading-snug">{p.display_name}</button>
                    <div className="mt-0.5 text-base font-extrabold text-brand">{p.price_text}</div>
                    <StockBadge status={stockText(p, m)} />
                    {expFlag(p)}
                    {!line && (
                      <button
                        onClick={() => add(p.item_code, p)}
                        className={`mt-auto min-h-touch w-full rounded-lg text-lg font-bold ${cardOOS(p) ? "border-2 border-red-300 bg-red-50 text-red-600" : "bg-brand text-white"}`}
                      >
                        {cardOOS(p) ? "Vẫn bán" : "＋ Thêm"}
                      </button>
                    )}
                  </div>
                ) : (
                  // List = compact horizontal row.
                  <div className="flex items-center gap-3">
                    <button onClick={() => setPreview(p.item_code)} aria-label="Xem chi tiết" className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                      <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="thumb" />
                      <span className="absolute bottom-0 right-0 rounded-tl-md bg-black/45 px-1 text-[10px] leading-tight text-white">🔍</span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <button onClick={() => setPreview(p.item_code)} className="line-clamp-2 text-left font-bold leading-tight underline-offset-2 hover:underline">{p.display_name}</button>
                      <div className="text-base font-extrabold text-brand">{p.price_text}</div>
                      <StockBadge status={stockText(p, m)} />
                      {expFlag(p)}
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
                    {/* Stepper + unit; total + Bỏ. On the narrow CARD (2-col) these stack onto two
                        rows so the total/Bỏ never overflow the card; on the wide LIST/panel they
                        sit on one stable row. */}
                    {(() => {
                      // In split mode the per-lô steppers drive the qty (total = their sum), so the
                      // line shows the total read-only instead of a stepper that would desync.
                      const stepper = lotManual[p.item_code] ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600">Σ lô: {trim(line.qty)} {labelOf(p.item_code, line.uom)}</span>
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button onClick={() => setQty(p.item_code, line.qty - 1)} className="h-11 w-11 rounded-lg bg-slate-200 text-2xl font-bold">−</button>
                          <button
                            onClick={() => setKeypad(p.item_code)}
                            title="Bấm để nhập số lượng"
                            className="h-11 w-14 rounded-lg border-2 border-emerald-300 text-center text-xl font-extrabold"
                          >
                            {trim(line.qty)}
                          </button>
                          <button onClick={() => setQty(p.item_code, line.qty + 1)} className="h-11 w-11 rounded-lg bg-brand text-2xl font-bold text-white">＋</button>
                        </div>
                      );
                      const unit = lotManual[p.item_code] ? <span className="min-w-0 flex-1" /> : <span className="min-w-0 flex-1 truncate text-sm text-slate-500">{labelOf(p.item_code, line.uom)}</span>;
                      const total = <span className="shrink-0 whitespace-nowrap text-lg font-extrabold text-brand">{money(linePrice(p.item_code) * line.qty)}</span>;
                      const remove = <button onClick={() => setQty(p.item_code, 0)} className="shrink-0 rounded-lg bg-red-50 px-2.5 py-1.5 text-sm font-bold text-red-600">Bỏ</button>;
                      return viewMode === "card" ? (
                        <>
                          <div className="flex items-center gap-1.5">{stepper}{unit}</div>
                          <div className="mt-1.5 flex items-center justify-between gap-2">{total}{remove}</div>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">{stepper}{unit}{total}{remove}</div>
                      );
                    })()}
                    {p.has_batch && (
                      <LotPicker
                        code={p.item_code}
                        lineQty={line.qty}
                        manual={!!lotManual[p.item_code]}
                        alloc={lotAlloc[p.item_code] || {}}
                        onLoaded={onLotsLoaded}
                        onToggleManual={toggleLotManual}
                        onSetAlloc={setLotAllocQty}
                      />
                    )}
                    {allowPriceEdit && (
                      <div className="mt-2 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-sm">
                        <span className="whitespace-nowrap text-slate-500">Đơn giá:</span>
                        <input
                          inputMode="numeric"
                          value={line.rate != null ? line.rate.toLocaleString("vi-VN") : ""}
                          onChange={(e) => setRate(p.item_code, e.target.value)}
                          placeholder={fmtAmt(String(unitPrice(p.item_code, line.uom)))}
                          className={`h-9 w-24 rounded-lg border-2 px-2 text-right font-bold ${line.rate != null ? "border-amber-400 bg-amber-50" : "border-slate-300"}`}
                        />
                        <span className="whitespace-nowrap text-slate-400">/ {labelOf(p.item_code, line.uom)}</span>
                        {line.rate != null && (
                          <button onClick={() => setRate(p.item_code, "")} className="whitespace-nowrap text-amber-700 underline">
                            gốc {money(unitPrice(p.item_code, line.uom))}
                          </button>
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

      {showTop && !panelOpen && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Lên đầu trang"
          className={`fixed right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-slate-700/90 text-2xl font-bold text-white shadow-lg backdrop-blur ${cartCodes.length > 0 ? "bottom-24" : "bottom-5"}`}
        >
          ↑
        </button>
      )}

      </div>

      {/* PC only: when the cart is empty the right column would be blank — show a hint instead. */}
      {cartCodes.length === 0 && (
        <aside className="hidden xl:flex xl:sticky xl:top-4 min-h-[300px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400">
          <div className="text-5xl">🛒</div>
          <div className="mt-2 font-bold">Giỏ hàng trống</div>
          <div className="mt-1 text-sm">Tìm và bấm ＋ Thêm sản phẩm ở bên trái để bắt đầu bán.</div>
        </aside>
      )}

      {cartCodes.length > 0 && (
        <>
          {/* Dim the page when the slide-up sheet is open (phone/tablet only — the docked PC cart
              never dims). */}
          {payOpen && !desktop && <div className={`fixed inset-0 z-10 bg-black/30 ${payClosing ? "animate-fade-out" : "animate-fade-in"}`} onClick={closePay} aria-hidden />}
          {/* Phone/tablet: fixed slide-up sheet. PC (xl): a normal sticky card in the right column. */}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.08)] xl:sticky xl:inset-x-auto xl:bottom-auto xl:top-4 xl:z-auto xl:rounded-2xl xl:border xl:pb-0 xl:shadow-card">
            <div className="mx-auto max-w-[960px]">
              {!panelOpen ? (
                // COLLAPSED — one slim row. Keeps the product list visible so staff can keep
                // searching/adding; tap to open the full payment panel only when ready.
                <button onClick={() => setPayOpen(true)} className="flex w-full items-center justify-between gap-3 p-3 text-left">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-500">
                      🛒 {cartCodes.length} mặt hàng{cust ? ` · ${cust.customer_name}` : ""}
                    </span>
                    <span className="text-2xl font-extrabold text-brand">{money(payTotal)}</span>
                  </span>
                  <span className="shrink-0 rounded-xl bg-brand px-5 py-3 text-lg font-extrabold text-white">Thanh toán ▲</span>
                </button>
              ) : (
                <div className={`no-scrollbar max-h-[82vh] overflow-auto p-3 xl:max-h-[calc(100vh-2rem)] xl:animate-none ${payClosing ? "animate-sheet-down" : "animate-sheet-up"}`}>
                  <button onClick={closePay} className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-2 font-bold text-slate-500 xl:hidden">
                    ▼ Thu gọn — chọn thêm hàng
                  </button>
                  <div className="mb-2 hidden text-lg font-extrabold text-brand-dark xl:block">🛒 Giỏ hàng</div>
                  {/* Cart lines — listed + qty-editable right here, so staff never has to close the
                      panel to fix a quantity. Tap the number for the keypad; ✕ removes the line. */}
                  <div className="mb-2 max-h-[38vh] divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200 xl:max-h-none xl:overflow-visible">
                    {cartCodes.map((c) => {
                      const ln = lines[c];
                      const units = meta[c]?.sale_units || [];
                      return (
                        <div key={c} className="px-2.5 py-2">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-base font-bold leading-tight">{nameOf(c)}</div>
                              <div className="text-sm text-slate-500">{money(linePrice(c))} / {labelOf(c, ln.uom)}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button onClick={() => setQty(c, ln.qty - 1)} className="h-11 w-11 rounded-lg bg-slate-200 text-2xl font-bold">−</button>
                              <button onClick={() => setKeypad(c)} title="Bấm để nhập số lượng" className="h-11 w-14 rounded-lg border-2 border-emerald-300 text-center text-lg font-extrabold">{trim(ln.qty)}</button>
                              <button onClick={() => setQty(c, ln.qty + 1)} className="h-11 w-11 rounded-lg bg-brand text-2xl font-bold text-white">＋</button>
                            </div>
                            <div className="min-w-[84px] shrink-0 whitespace-nowrap text-right text-base font-extrabold text-brand">{money(linePrice(c) * ln.qty)}</div>
                            <button onClick={() => setQty(c, 0)} aria-label="Bỏ" className="shrink-0 rounded-lg bg-red-50 px-2 py-1 text-sm font-bold text-red-600">✕</button>
                          </div>
                          {/* Multi-unit items: switch Kg / Yến / Bao right in the cart (changes the price). */}
                          {units.length > 1 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {units.map((u) => (
                                <button
                                  key={u.uom}
                                  onClick={() => setUom(c, u.uom)}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-bold ${ln.uom === u.uom ? "bg-brand text-white" : "bg-slate-200 text-slate-700"}`}
                                >
                                  {(u.label || u.uom)} · {u.price_text}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
                    <span className="text-2xl leading-none text-slate-400">{custInPanel ? "▲" : "▼"}</span>
                  </button>
                  {/* Smooth expand/collapse (grid-rows 0fr↔1fr animates height both ways). */}
                  <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${custInPanel ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      <div className="pb-2">
                        <CustomerPicker
                          online={online}
                          onPick={(c) => { setCust(c); setCustInPanel(false); }}
                          onWalkIn={() => { setCust(null); setCustInPanel(false); }}
                        />
                      </div>
                    </div>
                  </div>
                  {/* Count + a single collapsible Giảm giá/Mã (most sales have no discount, so it
                      stays out of the way; auto-opens when a discount/coupon is already applied). */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-500">{cartCodes.length} mặt hàng</span>
                    <button
                      onClick={() => setDiscOpen((v) => !v)}
                      className={`rounded-lg border-2 px-3 py-1.5 text-sm font-bold ${totalSaved > 0 ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-300 text-slate-600"}`}
                    >
                      🏷️ Giảm giá / Mã{totalSaved > 0 ? ` · −${money(totalSaved)}` : discOpen ? " ▲" : " ▼"}
                    </button>
                  </div>
                  <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${discOpen || totalSaved > 0 || !!coupon || deliveryNum > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                    <div className="mt-2 space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-2.5">
                      {/* Manual "giảm trực tiếp" is bargaining — only when the owner enabled price
                          editing (the server enforces this too). Coupons below stay available. */}
                      {allowPriceEdit && (
                        <>
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
                          {/* Per-staff cap hint (server also enforces in quick_sale) so the cashier knows the limit upfront. */}
                          {!!boot?.max_discount_pct && boot.max_discount_pct < 100 && <div className="text-right text-xs text-slate-400">Bạn được giảm tối đa {trim(boot.max_discount_pct)}%</div>}
                        </>
                      )}
                      {online ? (
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
                      ) : (
                        <div className="text-sm text-slate-400">🎟 Mã giảm giá cần mạng</div>
                      )}
                      {couponMsg && <div className="text-right text-xs">{couponMsg}</div>}
                      {/* Loyalty redemption — only when a real (non-walk-in) customer with points is
                          chosen. The customer spends điểm at redeemVnd đồng each; capped server-side. */}
                      {cust && (cust.points || 0) > 0 && (
                        <div className="border-t border-amber-200 pt-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-slate-600">
                              ⭐ Dùng điểm <span className="text-xs text-slate-400">(có {cust.points}đ)</span>
                            </span>
                            <div className="flex items-center gap-1.5">
                              <input
                                inputMode="numeric"
                                value={redeemPts ? String(redeemPts) : ""}
                                onChange={(e) => setRedeemPts(parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 0)}
                                placeholder="0"
                                className="h-9 w-20 rounded-lg border-2 border-amber-300 px-2 text-right"
                              />
                              <button
                                onClick={() => setRedeemPts(maxRedeem)}
                                className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1.5 text-sm font-bold text-white disabled:opacity-40"
                                disabled={maxRedeem === 0}
                              >
                                Tối đa
                              </button>
                            </div>
                          </div>
                          {redeemUse > 0 && (
                            <div className="text-right text-xs text-amber-700">
                              {redeemUse} điểm = giảm {money(redeemDisc)}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Phí giao hàng tận nơi (cám/phân bao nặng) — cộng thẳng vào tiền khách trả. */}
                      <div className="flex items-center justify-between gap-2 border-t border-amber-200 pt-2">
                        <span className="text-sm text-slate-600">🚚 Phí giao hàng</span>
                        <input
                          inputMode="numeric"
                          value={delivery}
                          onChange={(e) => setDelivery(fmtAmt(e.target.value))}
                          placeholder="0"
                          className="h-9 w-24 rounded-lg border-2 border-amber-300 px-2 text-right"
                        />
                      </div>
                    </div>
                    </div>
                  </div>
                  {/* Total — the number to confirm: prominent, boxed, right above the pay buttons. */}
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-light/60 px-3.5 py-3">
                    <div>
                      <div className="text-sm font-bold text-slate-500">Tổng tiền</div>
                      {totalSaved > 0 && <div className="text-xs font-bold text-amber-700">đã giảm {money(totalSaved)}</div>}
                    </div>
                    <span className="text-3xl font-extrabold text-brand">{money(payTotal)}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
              <button onClick={() => checkout("cash")} disabled={busy} className="min-h-touch rounded-xl bg-brand py-3.5 text-lg font-extrabold text-white disabled:opacity-50">
                💵 Tiền mặt
              </button>
              <button
                onClick={() => checkout("bank")}
                disabled={busy || !online}
                title={!online ? "Chuyển khoản cần mạng" : ""}
                className="min-h-touch rounded-xl bg-violet-600 py-3.5 text-lg font-extrabold text-white disabled:opacity-40"
              >
                💳 C.khoản{!online && " ⛔"}
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
            {online && (
              <button onClick={() => setShowSplit((v) => !v)} className="mt-2 w-full rounded-xl border-2 border-slate-300 bg-white py-2.5 font-bold text-slate-700">
                ➗ Tách / trả một phần {showSplit ? "▲" : "▼"}
              </button>
            )}
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
                  const rest = payTotal - paid;
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

      {proofCtx !== null && boot?.debt_proof?.debt && (
        <ConfirmDebt
          amount={proofCtx}
          kind="debt"
          customerName={cust?.customer_name}
          policy={boot.debt_proof.debt}
          onDone={(p) => resolveProof(p)}
          onCancel={() => resolveProof(false)}
        />
      )}
    </div>
  );
}

// Tap a product image/title on the sell screen → this preview so staff can verify it's the right
// product (big image, full name, units, stock, location, advice, safety) before adding to the order.
function ProductPreview({
  code,
  line,
  qtyText,
  unitLabel,
  onClose,
  onAdd,
  onInc,
  onDec,
  onRemove,
}: {
  code: string;
  line: Line | null;
  qtyText: string;
  unitLabel: string;
  onClose: () => void;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
}) {
  const [p, setP] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    frappeCall<Product>("cago.api.staff.get_product", { item_code: code }, { method: "GET" })
      .then(setP)
      // Offline / network drop: fall back to the cached catalog row so the preview still works.
      .catch(async () => setP(((await getProductLocal(code)) as Product) ?? null))
      .finally(() => setLoading(false));
  }, [code]);
  return (
    <div className="fixed inset-0 z-[80] flex animate-fade-in items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="no-scrollbar flex max-h-[88vh] w-full max-w-[520px] animate-sheet-up flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div className="text-lg font-extrabold text-brand-dark">Xem lại sản phẩm</div>
          <button onClick={onClose} className="rounded-lg bg-slate-200 px-3 py-1.5 font-bold text-slate-700">Đóng</button>
        </div>
        <div className="no-scrollbar overflow-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : !p ? (
            <div className="py-10 text-center text-slate-500">Không tải được sản phẩm.</div>
          ) : (
            <ProductInfo p={p} />
          )}
        </div>
        {/* Action: confirm it's the right item → add (or adjust qty if already in the order). */}
        <div className="border-t border-slate-200 px-4 py-3">
          {line ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button onClick={onDec} className="h-11 w-11 rounded-lg bg-slate-200 text-2xl font-bold">−</button>
                <span className="w-14 text-center text-xl font-extrabold">{qtyText}{unitLabel ? "" : ""}</span>
                <button onClick={onInc} className="h-11 w-11 rounded-lg bg-brand text-2xl font-bold text-white">＋</button>
                {unitLabel && <span className="ml-1 text-slate-500">{unitLabel}</span>}
              </div>
              <button onClick={onRemove} className="rounded-lg bg-red-50 px-3 py-2.5 font-bold text-red-600">Bỏ khỏi đơn</button>
            </div>
          ) : (
            <button onClick={onAdd} className="min-h-touch w-full rounded-xl bg-brand text-lg font-extrabold text-white">＋ Thêm vào đơn</button>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomerPicker({ onPick, onWalkIn, online }: { onPick: (c: Cust) => void; onWalkIn: () => void; online: boolean }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Cust[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", village: "" });
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const PAGE = 20;

  const run = async (query: string) => {
    try {
      const r = (online
        ? await frappeCall<Cust[]>("cago.api.sales.search_customers_lite", { query, start: 0 }, { method: "GET" })
        : ((await searchCustomersLocal(query, 0, PAGE)) as Cust[])) || [];
      setRows(r);
      setHasMore(r.length >= PAGE);
    } catch {
      setRows([]);
      setHasMore(false);
    }
  };
  const more = async () => {
    try {
      const r = (online
        ? await frappeCall<Cust[]>("cago.api.sales.search_customers_lite", { query: q.trim(), start: rows.length }, { method: "GET" })
        : ((await searchCustomersLocal(q.trim(), rows.length, PAGE)) as Cust[])) || [];
      setRows((prev) => [...prev, ...r]);
      setHasMore(r.length >= PAGE);
    } catch {
      setHasMore(false);
    }
  };
  useEffect(() => {
    void run("");
  }, []);

  const create = async () => {
    if (busy) return;
    if (!form.name.trim()) { toast.error("Nhập tên khách."); return; }
    setBusy(true);
    try {
      const r = await frappeCall<{ customer: string; customer_name: string }>("cago.api.sales.add_customer_lite", {
        customer_name: form.name.trim(),
        phone: form.phone.trim(),
        village: form.village.trim(),
      });
      onPick({ customer: r.customer, customer_name: r.customer_name, outstanding_text: "Không nợ" });
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : "không tạo được khách."}`);
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
          {/* No autoFocus: this picker is mounted inside the (collapsed) pay panel, so focusing on
              mount would pop the phone keyboard the moment staff tap "Thanh toán". They tap to type. */}
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              clearTimeout(tRef.current);
              tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
            }}
            enterKeyHint="search" placeholder="Tìm khách theo tên / SĐT..."
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
            {hasMore && (
              <button onClick={more} className="mt-1 w-full rounded-lg bg-slate-100 py-2 text-sm font-bold text-slate-600">⌄ Xem thêm khách</button>
            )}
          </div>
          {online ? (
            <button onClick={() => setAdding(true)} className="mt-2 w-full rounded-lg bg-teal-600 py-2.5 font-bold text-white">➕ Thêm khách mới</button>
          ) : (
            <div className="mt-2 rounded-lg bg-slate-100 py-2 text-center text-sm font-bold text-slate-400">➕ Thêm khách mới (cần mạng)</div>
          )}
        </div>
      )}
    </div>
  );
}

// Till shift (S7): per-cashier drawer accountability wired into the sell flow. Open with a
// starting float, sell, then count the drawer at close and see expected vs counted.
interface ShiftState {
  open: boolean;
  blind?: boolean; // blind close: cashier counts the drawer without seeing the expected figure
  opened_at?: string;
  opening_text?: string;
  cash_sales_text?: string;
  expected?: number;
  expected_text?: string;
}
interface CloseResult {
  blind?: boolean;
  expected_text?: string;
  counted_text: string | null;
  diff_text?: string;
  match?: boolean | null;
  over?: boolean;
  cash_sales_text?: string;
  opening_text: string;
  payouts_text: string;
}
const num = (s: string) => parseInt((s || "").replace(/[^\d]/g, ""), 10) || 0;

function ShiftBar({ refreshKey, onState, cashier }: { refreshKey: number; onState?: (open: boolean) => void; cashier?: string }) {
  const [shift, setShift] = useState<ShiftState | null>(null);
  const [mode, setMode] = useState<"none" | "open" | "close" | "mv">("none");
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [payouts, setPayouts] = useState("");
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<CloseResult | null>(null);
  const [mvKind, setMvKind] = useState<"Nộp quỹ" | "Rút quỹ" | "Chi vặt">("Rút quỹ");
  const [mvAmt, setMvAmt] = useState("");
  const [mvReason, setMvReason] = useState("");
  // The shift card is secondary while selling, so it collapses to a slim one-line strip (status +
  // expected cash) and expands on tap for the detail + Quỹ/Đóng ca — reclaiming room for products.
  const [det, setDet] = useState(false);
  useLockBodyScroll(mode !== "none" || !!closed); // lock background while a shift sheet/result is open

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
      toast.error(`Lỗi: ${e instanceof Error ? e.message : "không mở được ca."}`);
    } finally {
      setBusy(false);
    }
  };
  const doClose = async () => {
    if (busy) return;
    // Offline sales still in the queue would sync AFTER this close — their posted_at falls inside the
    // now-closed shift window, so they're counted in NO shift → the drawer shows a phantom surplus and
    // the cash is orphaned from reconciliation. Warn before closing; allow override so a cashier who
    // genuinely can't wait for the network isn't trapped.
    const pend = (await queueCounts().catch(() => ({ pending: 0 }))).pending;
    if (pend > 0 && !(await confirmDialog(`Còn ${pend} đơn bán chưa đồng bộ lên hệ thống. Đóng ca bây giờ dễ làm LỆCH tiền két (mấy đơn này sẽ vào sau khi đã chốt). Nên chờ có mạng, đồng bộ xong rồi hãy đóng ca.\n\nVẫn đóng ca?`))) {
      return;
    }
    setBusy(true);
    try {
      const r = await frappeCall<CloseResult>("cago.api.shift.close_shift", { counted_cash: num(counted), payouts: num(payouts) });
      setClosed(r);
      setMode("none");
      setCounted("");
      setPayouts("");
      await load();
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : "không đóng được ca."}`);
    } finally {
      setBusy(false);
    }
  };

  const doMovement = async () => {
    if (busy) return;
    if (num(mvAmt) <= 0) { toast.error("Nhập số tiền lớn hơn 0."); return; }
    setBusy(true);
    try {
      apply(await frappeCall<ShiftState>("cago.api.shift.add_cash_movement", { kind: mvKind, amount: num(mvAmt), reason: mvReason }));
      setMode("none");
      setMvAmt("");
      setMvReason("");
      toast.success(`Đã ghi ${mvKind.toLowerCase()}.`);
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : "không ghi được."}`);
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
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50">
          {/* Slim one-line strip: status + (unless blind) expected cash. Tap to expand. */}
          <button onClick={() => setDet((v) => !v)} className="flex w-full items-center justify-between gap-2 p-2.5 text-left">
            <span className="min-w-0 truncate text-sm font-bold text-emerald-800">
              🟢 Ca mở{shift.blind ? "" : <> · 💰 Dự kiến két <b>{shift.expected_text}</b></>}
            </span>
            <span className="shrink-0 text-emerald-700">{det ? "▴ Thu gọn" : "▾ Chi tiết"}</span>
          </button>
          {det && (
            <div className="flex items-end justify-between gap-2 border-t border-emerald-200 px-2.5 pb-2.5 pt-2">
              <div className="min-w-0 text-xs text-emerald-700/90">
                <div>Mở lúc {shift.opened_at}{cashier ? ` · 👤 ${cashier}` : ""}</div>
                {/* Blind close hides the expected figure (anti-fraud); cashier only sees it's open. */}
                {shift.blind ? (
                  <div>Đầu ca {shift.opening_text} · đếm két khi đóng ca</div>
                ) : (
                  <div>Đầu ca {shift.opening_text} · Tiền mặt trong ca {shift.cash_sales_text}</div>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button onClick={() => setMode("mv")} className="rounded-lg bg-amber-500 px-2.5 py-2 text-sm font-bold text-white">💵 Quỹ</button>
                <button onClick={() => setMode("close")} className="rounded-lg bg-red-600 px-3 py-2 font-bold text-white">🔴 Đóng ca</button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "mv" && (
        <div className="fixed inset-0 z-40 flex animate-fade-in items-end justify-center bg-black/40 sm:items-center" onClick={() => setMode("none")}>
          <div className="w-full max-w-[380px] animate-sheet-up rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-xl font-bold">💵 Nộp / rút quỹ · chi vặt</div>
            <div className="grid grid-cols-3 gap-2">
              {(["Nộp quỹ", "Rút quỹ", "Chi vặt"] as const).map((k) => (
                <button key={k} onClick={() => setMvKind(k)} className={`rounded-xl py-2.5 text-sm font-bold ${mvKind === k ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`}>{k}</button>
              ))}
            </div>
            <label className="mt-3 block font-bold text-slate-600">Số tiền</label>
            <input autoFocus inputMode="numeric" value={mvAmt} onChange={(e) => setMvAmt(fmtAmt(e.target.value))} placeholder="0" className="mt-1 w-full rounded-xl border-2 border-emerald-300 p-3 text-right text-2xl font-extrabold" />
            <label className="mt-2 block font-bold text-slate-600">Lý do</label>
            <input value={mvReason} onChange={(e) => setMvReason(e.target.value)} placeholder="vd: mua trà nước, chủ lấy tiền…" className="mt-1 w-full rounded-xl border-2 border-emerald-200 p-2.5" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setMode("none")} className="flex-1 rounded-xl bg-slate-200 py-3 font-bold">Huỷ</button>
              <button onClick={doMovement} disabled={busy} className="flex-[2] rounded-xl bg-amber-600 py-3 text-lg font-extrabold text-white disabled:opacity-50">Ghi vào sổ quỹ</button>
            </div>
          </div>
        </div>
      )}

      {mode === "open" && (
        <div className="fixed inset-0 z-40 flex animate-fade-in items-end justify-center bg-black/40 sm:items-center" onClick={() => setMode("none")}>
          <div className="w-full max-w-[380px] animate-sheet-up rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
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
        <div className="fixed inset-0 z-40 flex animate-fade-in items-end justify-center bg-black/40 sm:items-center" onClick={() => setMode("none")}>
          <div className="w-full max-w-[380px] animate-sheet-up rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 text-xl font-bold">🔴 Đóng ca · đếm két</div>
            {!shift.blind && (
              <div className="mb-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
                Đầu ca {shift.opening_text} + Tiền mặt bán {shift.cash_sales_text} = <b>dự kiến {shift.expected_text}</b>
              </div>
            )}
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
        <div className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-black/40 p-4" onClick={() => setClosed(null)}>
          <div className="w-full max-w-[380px] animate-pop-in rounded-2xl bg-white p-5 text-center" onClick={(e) => e.stopPropagation()}>
            {closed.blind ? (
              // Blind close: cashier only sees that the shift closed + their counted amount.
              <>
                <div className="text-5xl">✅</div>
                <div className="mt-1 text-xl font-bold">Đã đóng ca</div>
                <div className="mt-3 space-y-1 text-left text-sm text-slate-600">
                  <div className="flex justify-between"><span>Tiền đầu ca</span><b>{closed.opening_text}</b></div>
                  <div className="flex justify-between"><span>Chi ra trong ca</span><b>{closed.payouts_text}</b></div>
                  <div className="flex justify-between border-t pt-1"><span>Đếm thực tế</span><b>{closed.counted_text}</b></div>
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
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
    <div className="fixed inset-0 z-40 flex animate-fade-in items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-[380px] animate-sheet-up rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
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
