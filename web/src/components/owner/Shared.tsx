"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";

// useLayoutEffect runs before paint (so a measured value lands on the FIRST visible frame — no flash),
// but warns under SSR; fall back to useEffect on the server. SearchHeader is client-only in practice.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog, alertDialog } from "@/components/ui/dialog";
import { copyText, formatVnd, groupVnd, parseVnd } from "@/lib/utils";
import { Sheet } from "@/components/ui/Sheet";
import { CatThumb } from "@/components/kiosk/CatThumb";
import { BarcodeScanner } from "@/components/ui/BarcodeScanner";
import { SearchInput } from "@/components/ui/ListUI";
import { StockBadge } from "@/components/ui/StockBadge";
import type { ProductCard } from "@/lib/types";

// Re-export so the many screens that already `import { StockBadge } from "@/components/owner/Shared"`
// keep working after the component moved to its own (kiosk-bundle-friendly) module.
export { StockBadge };

import { PageLoading } from "@/components/ui/Loading";
// VND has no decimals — round + group. Single shared formatter (lib/utils) so owner/staff/kiosk match.
export const money = formatVnd;

/**
 * Smart "back to the previous screen": when the user navigated here within the app this session,
 * step back through real history (so a screen reached from a non-home parent returns to that parent,
 * not all the way home). On a direct/refresh load with no in-app history, fall back to home.
 * The `cago_nav` flag is set by Shell on the first in-app route change.
 */
export function goBackSmart(router: ReturnType<typeof useRouter>, fallback = "/pos") {
  // Use the browser's real history (router.back) when we navigated here in-app — pushing a "back"
  // route instead leaves the current page in history and makes the NEXT Back loop into it. Only
  // fall back to an explicit route on a cold/deep-link load (no in-app history to step through).
  if (typeof window !== "undefined" && window.history.length > 1 && sessionStorage.getItem("cago_nav") === "1") {
    router.back();
  } else {
    router.push(fallback);
  }
}

/**
 * The slim brand-green sticky nav row shared by the whole POS/owner UI. Pinned to the very top so iOS
 * Safari tints the status bar green (it samples the top-of-viewport colour) → the seamless "native app"
 * top, consistent on every screen. The arrow goes to the previous step: pass `onBack` for an in-flow
 * sub-step, or omit it on a top-level screen to get smart history-back. A persistent 🏠 Home button is
 * ALWAYS shown. `right` is an optional trailing action — style it light (e.g. bg-white/20) to sit on green.
 * `-mx-4` makes it full-bleed inside the pos layout's px-4 column (do NOT use inside a padded card).
 */
function AppBarNav({
  onBack,
  title,
  label = "Quay lại",
  right,
  navRef,
  className = "",
  pinned = true,
  sub,
}: {
  onBack?: () => void;
  title?: string;
  label?: string;
  right?: React.ReactNode;
  navRef?: React.Ref<HTMLDivElement>;
  className?: string;
  pinned?: boolean;
  sub?: React.ReactNode;
}) {
  const router = useRouter();
  const back = onBack ?? (() => goBackSmart(router));
  const hasSub = sub != null;
  // Tier-2 (sub) hides on scroll-DOWN and returns on scroll-UP (Facebook-style); tier-1 (green title)
  // always stays. It slides on a pure TRANSFORM (translateY) like the bottom tab bar — composited on the
  // GPU, the document layout never changes, so there's no per-frame reflow and no "giật". (An earlier
  // grid-rows/max-height collapse animated a LAYOUT property → it shoved every row below it up each
  // frame = jank.) The sub is its OWN sticky element under the green bar (like SearchHeader): its flow
  // box lives at the top of the page, so once scrolled past, sliding it up leaves NO gap — content just
  // scrolls under where it was, exactly like the bottom bar. Only wired when there IS a sub.
  const greenRef = useRef<HTMLDivElement>(null);
  const setGreenRef = (el: HTMLDivElement | null) => {
    greenRef.current = el;
    if (typeof navRef === "function") navRef(el);
    else if (navRef) (navRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };
  const [navH, setNavH] = useState(0);
  const [showSub, setShowSub] = useState(true);
  const lastY = useRef(0);
  // Measure the green bar BEFORE paint so the sub sits at the right top: offset on the first frame.
  useIsoLayoutEffect(() => {
    if (hasSub) setNavH(greenRef.current?.offsetHeight ?? 0);
  }, [hasSub]);
  useEffect(() => {
    if (!hasSub) return;
    const measure = () => setNavH(greenRef.current?.offsetHeight ?? 0);
    window.addEventListener("resize", measure);
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        // Near the top always show; otherwise a small 4px deadzone so finger-wobble doesn't flip it.
        if (y < 60 || y < lastY.current - 4) setShowSub(true);
        else if (y > lastY.current + 4) setShowSub(false);
        lastY.current = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, [hasSub]);
  return (
    // Two-tier sticky header: the green title bar (shared, tier 1) + an optional WHITE `sub` toolbar
    // (tier 2) for this page's own controls. `pinned` (default) keeps the status bar green. When there's
    // no sub, `className` carries the bar's own bottom margin + elevation shadow; with a sub, those move
    // onto the sub block (a shadow on the green bar would seam against the white sub right below it).
    <>
      <div ref={setGreenRef} className={`appbar-pull ${pinned ? "sticky top-0 z-30" : ""} -mx-4 ${hasSub ? "" : className}`}>
        <div className="appbar-padtop bg-brand px-4 pb-3 text-white">
          {/* No 🏠 here — the bottom tab bar already has "Trang chủ", so the top-right is freed for each
              page's own useful actions (passed via `right`). */}
          <div className="flex items-center gap-2">
            <button onClick={back} className="shrink-0 rounded-xl bg-white/20 px-2.5 py-2 font-bold text-white active:bg-white/30">
              ‹ {label}
            </button>
            {title ? <div className="min-w-0 flex-1 truncate text-lg font-extrabold sm:text-xl">{title}</div> : <div className="flex-1" />}
            {right}
          </div>
        </div>
      </div>
      {hasSub && (
        // Separate sticky tier-2: sits just under the green bar (top: navH-8, the -mt-2 overlaps the
        // bar's pb-3 so there's no seam), slides up BEHIND it on scroll-down via translateY. transform-gpu
        // + backface-visibility:hidden keep it on its own compositor layer = buttery, exactly like the
        // bottom nav. -translate-y-[130%] clears its own shadow too; pointer-events-none while hidden.
        <div
          style={{ top: Math.max(0, navH - 8) }}
          className={`sticky z-20 -mx-4 -mt-2 mb-3 transform-gpu bg-white px-4 pb-2.5 pt-3 shadow-[0_4px_10px_-5px_rgba(0,0,0,0.18)] transition-transform duration-300 ease-out [backface-visibility:hidden] ${showSub ? "translate-y-0" : "pointer-events-none -translate-y-[130%]"}`}
        >
          {sub}
        </div>
      )}
    </>
  );
}

// The ONE shared POS/owner header, used across every /pos screen so a redesign happens in one place.
// Now a brand-green sticky app-bar (same API as before) → every screen matches Tra giá and keeps the
// status bar green. The kiosk has its OWN header set under components/kiosk (intentionally separate).
export function BackBar(props: { onBack?: () => void; title?: string; label?: string; right?: React.ReactNode; pinned?: boolean; sub?: React.ReactNode }) {
  // Soft downward shadow so the bar reads as a header floating above the content (the small gap below
  // becomes an elevation shadow, not a flat pale strip). Only on the standalone bar — SearchHeader puts
  // its shadow on the search block instead (a shadow here would seam between the nav and the search).
  return <AppBarNav {...props} className="mb-3 shadow-[0_4px_10px_-5px_rgba(0,0,0,0.18)]" />;
}

/**
 * Search variant of the app-bar for list-search screens (Tra giá, Bán hàng, staff Tìm hàng, …): the slim
 * green nav PLUS a "headroom" green search block that slides up behind the nav on scroll-down and returns
 * the instant the user scrolls up. Pure transform (translateY) → smooth, no reflow. The nav stays pinned
 * so the status bar keeps its green tint.
 */
export function SearchHeader({
  title,
  onBack,
  label,
  right,
  onSearch,
  searchValue,
  searchPlaceholder = "🔎 Tìm tên · mã · mã vạch…",
  onBarcodeKey,
  onCam,
  autoFocusSearch = true,
}: {
  title?: string;
  onBack?: () => void;
  label?: string;
  right?: React.ReactNode;
  onSearch: (e: ChangeEvent<HTMLInputElement>) => void;
  searchValue?: string;
  searchPlaceholder?: string;
  onBarcodeKey?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onCam?: () => void;
  autoFocusSearch?: boolean;
}) {
  const [showSearch, setShowSearch] = useState(true);
  const [navH, setNavH] = useState(0);
  const navRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastY = useRef(0);
  // Measure the nav height BEFORE the first paint so the search block is positioned right immediately
  // (was useEffect → first frame had navH=0 → the block briefly sat at top:0 then jumped down = a flash).
  useIsoLayoutEffect(() => {
    setNavH(navRef.current?.offsetHeight ?? 0);
  }, []);
  useEffect(() => {
    // Focus WITHOUT scrolling — the HTML `autoFocus` attribute scrolls the field into view, which
    // fought the route's scroll-to-top and flashed the header. preventScroll keeps the page still.
    if (autoFocusSearch) searchRef.current?.focus({ preventScroll: true });
    const measure = () => setNavH(navRef.current?.offsetHeight ?? 0);
    window.addEventListener("resize", measure);
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < 80 || y < lastY.current - 2) setShowSearch(true);
        else if (y > lastY.current + 2) setShowSearch(false);
        lastY.current = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, [autoFocusSearch]);
  return (
    <>
      <AppBarNav navRef={navRef} title={title} onBack={onBack} label={label} right={right} />
      <div
        style={{ top: Math.max(0, navH - 8) }}
        className={`sticky z-20 -mx-4 -mt-2 mb-3 transform-gpu bg-brand px-4 pb-3.5 pt-3 text-white shadow-[0_6px_10px_-4px_rgba(0,0,0,0.18)] transition-transform duration-200 ease-out [backface-visibility:hidden] ${showSearch ? "translate-y-0" : "-translate-y-[130%] pointer-events-none"}`}
      >
        {/* ONE box for name · code · barcode (no separate barcode field). A hardware scanner or a typed
            all-digit barcode + Enter resolves & adds via onBarcodeKey; a name search does nothing
            special. The 📷 opens the camera — type="button" + onMouseDown preventDefault so a single
            tap fires it even while the search box has focus (no "first tap just focuses input"). */}
        <div className="flex gap-2">
          <input
            ref={searchRef}
            {...(searchValue !== undefined ? { value: searchValue } : {})}
            onChange={onSearch}
            onKeyDown={(e) => {
              if (onBarcodeKey && e.key === "Enter" && /^\d{6,}$/.test((e.target as HTMLInputElement).value.trim())) onBarcodeKey(e);
            }}
            enterKeyHint="search"
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 rounded-xl border-0 bg-white p-3.5 text-lg text-slate-800 placeholder:text-slate-400"
          />
          {onCam && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onCam}
              aria-label="Quét bằng camera"
              className="shrink-0 rounded-xl bg-white px-3.5 text-2xl text-brand-dark shadow-sm"
            >
              📷
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// Inline alert banners (used app-wide). Soft tinted fill + a thin border with a left accent bar,
// rounded + a subtle shadow, and a gentle entrance — modern but calm.
export function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-rise-in mt-3 rounded-2xl border border-amber-200 border-l-4 border-l-amber-400 bg-amber-50 px-4 py-3 font-medium text-amber-900 shadow-sm">
      {children}
    </div>
  );
}
export function Ok({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-rise-in mt-3 rounded-2xl border border-emerald-200 border-l-4 border-l-emerald-500 bg-emerald-50 px-4 py-3 font-medium text-emerald-800 shadow-sm">
      {children}
    </div>
  );
}

export function DraftModal({
  text,
  onClose,
  phone,
  title = "📩 Tin nhắn (Zalo/SMS)",
  allowPrint = false,
  note,
}: {
  text: string;
  onClose: () => void;
  phone?: string;
  title?: string;
  allowPrint?: boolean;
  note?: React.ReactNode; // owner-only guidance shown OUTSIDE the copyable text
}) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const [canSend, setCanSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<null | boolean>(null);
  const doCopy = async () => setCopyState((await copyText(text)) ? "ok" : "fail");
  useEffect(() => {
    // Show the "Gửi luôn" button only when the owner has wired a messaging webhook (else copy-only).
    frappeCall<{ configured: boolean }>("cago.api.notify.notify_status", {}, { method: "GET" })
      .then((r) => setCanSend(!!r.configured))
      .catch(() => setCanSend(false));
  }, []);
  const send = async () => {
    if (!phone) return;
    setSending(true);
    try {
      await frappeCall("cago.api.notify.send_draft", { phone, text });
      setSent(true);
    } catch {
      setSent(false);
    } finally {
      setSending(false);
    }
  };
  const print = () => {
    const w = window.open("", "_blank", "width=380,height=640");
    if (!w) return;
    const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.write(`<pre style="font:14px/1.5 monospace;white-space:pre-wrap;padding:14px;margin:0">${esc}</pre>`);
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <Sheet open onClose={onClose} label={title}>
        <h3 className="text-lg font-bold">{title}</h3>
        <textarea readOnly value={text} rows={allowPrint ? 8 : 5} className="mt-2 w-full rounded-lg border-2 border-slate-300 p-3 text-base" />
        {note && <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">{note}</div>}
        {sent === true && <Ok>Đã gửi tin nhắn.</Ok>}
        {sent === false && <Warn>Gửi không thành công — bác sao chép gửi tay giúp nhé.</Warn>}
        {copyState === "ok" && <Ok>Đã sao chép! Mở Zalo/tin nhắn và dán (giữ → Dán).</Ok>}
        {copyState === "fail" && <Warn>Máy không cho tự sao chép. Bác giữ ngón tay vào ô chữ phía trên → “Chọn tất cả” → “Sao chép”.</Warn>}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button onClick={doCopy} className="min-h-touch whitespace-nowrap rounded-xl bg-brand font-extrabold text-white">
            {copyState === "ok" ? "✅ Đã chép" : "📋 Sao chép"}
          </button>
          {canSend && phone ? (
            <button onClick={send} disabled={sending} className="min-h-touch whitespace-nowrap rounded-xl bg-violet-600 font-extrabold text-white disabled:opacity-60">
              {sending ? "Đang gửi…" : "📤 Gửi luôn"}
            </button>
          ) : allowPrint ? (
            <button onClick={print} className="min-h-touch whitespace-nowrap rounded-xl bg-blue-600 font-extrabold text-white">🖨 In</button>
          ) : (
            <button onClick={onClose} className="min-h-touch whitespace-nowrap rounded-xl bg-slate-200 font-extrabold text-slate-700">Đóng</button>
          )}
          {/* Second row when both Send AND Print apply, or to always offer Đóng without crowding. */}
          {allowPrint && canSend && phone && (
            <button onClick={print} className="min-h-touch whitespace-nowrap rounded-xl bg-blue-600 font-extrabold text-white">🖨 In</button>
          )}
          {(canSend && phone) || allowPrint ? (
            <button onClick={onClose} className="min-h-touch whitespace-nowrap rounded-xl bg-slate-200 font-extrabold text-slate-700">Đóng</button>
          ) : null}
        </div>
    </Sheet>
  );
}

/** Product search + list; calls onPick(item_code). */
export function ProductPicker({ title, onBack, onPick, accent = false }: { title: string; onBack: () => void; onPick: (code: string) => void; accent?: boolean }) {
  const [list, setList] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [camOpen, setCamOpen] = useState(false); // camera barcode scanner overlay
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const run = async (q: string) => {
    setLoading(true);
    try {
      const r = await frappeCall<ProductCard[]>("cago.api.owner.search_products", { query: q }, { method: "GET" });
      setList(r || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void run("");
  }, []);
  const findBarcode = async (code: string) => {
    if (!code.trim()) return;
    const r = await frappeCall<{ item_code: string | null }>(
      "cago.api.catalog.find_by_barcode",
      { barcode: code.trim() },
      { method: "GET" },
    );
    if (r.item_code) onPick(r.item_code);
    else await alertDialog("Không tìm thấy sản phẩm với mã vạch này.");
  };
  const onSearch = (e: ChangeEvent<HTMLInputElement>) => {
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
  };
  const onBarcodeKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      void findBarcode((e.target as HTMLInputElement).value);
      (e.target as HTMLInputElement).value = "";
    }
  };
  return (
    <div>
      {accent ? (
        <SearchHeader
          title={title}
          onBack={onBack}
          onSearch={onSearch}
          onBarcodeKey={onBarcodeKey}
          onCam={() => setCamOpen(true)}
          searchPlaceholder="🔎 Tên, tên hay gọi, màu bao..."
        />
      ) : (
        <>
          <BackBar onBack={onBack} />
          {/* ONE box: type a name/code to filter, or scan a barcode (USB/BT scanner types digits + Enter;
              📷 opens the phone camera). type="button" + onMouseDown preventDefault → one-tap camera. */}
          <div className="mb-2 flex gap-2">
            <input
              autoFocus
              onChange={onSearch}
              onKeyDown={(e) => { if (e.key === "Enter" && /^\d{6,}$/.test((e.target as HTMLInputElement).value.trim())) onBarcodeKey(e); }}
              enterKeyHint="search"
              placeholder="🔎 Tên · mã · mã vạch…"
              className="min-w-0 flex-1 rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
            />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setCamOpen(true)} aria-label="Quét bằng camera" className="shrink-0 whitespace-nowrap rounded-xl bg-emerald-600 px-4 text-2xl text-white">📷</button>
          </div>
        </>
      )}
      {camOpen && (
        <BarcodeScanner
          onScan={(c) => {
            setCamOpen(false);
            void findBarcode(c);
          }}
          onClose={() => setCamOpen(false)}
        />
      )}
      {!accent && <div className="text-xl font-bold text-brand-dark">{title}</div>}
      {loading ? (
        <PageLoading />
      ) : list.length === 0 ? (
        <div className="text-slate-500">Không tìm thấy.</div>
      ) : (
        <div className="md:grid md:grid-cols-2 md:gap-x-3">
        {list.map((p) => (
          <button key={p.item_code} onClick={() => onPick(p.item_code)} className="mb-3 flex w-full items-center gap-3 rounded-xl bg-white p-3.5 text-left shadow">
            <div className="h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg">
              <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="thumb" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold leading-tight">{p.display_name}</div>
              <div className="text-lg font-extrabold text-brand">{p.price_text}</div>
              <StockBadge status={p.stock_status} />
            </div>
          </button>
        ))}
        </div>
      )}
    </div>
  );
}


interface CustomerHit {
  customer: string;
  customer_name: string;
  village?: string;
  mobile?: string;
  debt?: number;
}

/** Customer search with "add new"; calls onPick(customer). */
export function CustomerPicker({ title, onBack, onPick }: { title: string; onBack: () => void; onPick: (c: string) => void }) {
  const [list, setList] = useState<CustomerHit[]>([]);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savingRef = useRef(false);
  const [form, setForm] = useState({ name: "", phone: "", village: "", limit: "", wholesale: false });
  const [msg, setMsg] = useState<React.ReactNode>(null);

  const run = async (query: string) => {
    const r = await frappeCall<CustomerHit[]>("cago.api.debt.search_customers", { query }, { method: "GET" });
    setList(r || []);
  };
  useEffect(() => {
    void run("");
  }, []);

  if (adding) {
    const save = async () => {
      setMsg(null);
      if (savingRef.current) return;
      if (!form.name.trim()) return setMsg(<Warn>Nhập tên khách.</Warn>);
      savingRef.current = true;
      try {
        const r = await frappeCall<{ customer: string }>("cago.api.debt.add_customer", {
          customer_name: form.name.trim(),
          phone: form.phone.trim(),
          village: form.village.trim(),
          debt_limit: parseVnd(form.limit),
          wholesale: form.wholesale ? 1 : 0,
        });
        onPick(r.customer);
      } catch (e) {
        setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi: không tạo được khách."}</Warn>);
        savingRef.current = false;
      }
    };
    return (
      <div>
        <BackBar onBack={() => setAdding(false)} label="Quay lại" title="👤 Thêm khách mới" />
        <div className="rounded-xl bg-white p-4">
          <label className="block font-bold text-slate-700">Tên khách *</label>
          <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <label className="block font-bold text-slate-700">Số điện thoại (tùy chọn)</label>
          <input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="VD: 0987654321" className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <label className="block font-bold text-slate-700">Xóm/thôn (tùy chọn)</label>
          <input value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <label className="block font-bold text-slate-700">Hạn mức nợ (tùy chọn, đồng)</label>
          <input inputMode="numeric" value={form.limit} onChange={(e) => setForm({ ...form, limit: groupVnd(e.target.value) })} placeholder="Để trống = không giới hạn" className="mb-2 mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          <label className="mt-1 flex items-center gap-2 font-bold text-violet-700">
            <input type="checkbox" checked={form.wholesale} onChange={(e) => setForm({ ...form, wholesale: e.target.checked })} className="h-5 w-5" />
            Khách sỉ (mua theo giá sỉ)
          </label>
          <button onClick={save} className="mt-2 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
            Lưu khách
          </button>
          {msg}
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackBar onBack={onBack} />
      <button onClick={() => setAdding(true)} className="mt-tile mb-3 min-h-[60px] w-full bg-teal-600 text-lg">
        ➕ Thêm khách mới
      </button>
      <SearchInput
        value={q}
        onChange={(v) => {
          setQ(v);
          clearTimeout(tRef.current);
          tRef.current = setTimeout(() => run(v.trim()), 250);
        }}
        placeholder="🔎 Tên khách, xóm..."
        autoFocus
      />
      <div className="text-xl font-bold text-brand-dark">{title}</div>
      <div className="mb-1 text-sm text-slate-500">Chọn khách để thực hiện — số bên phải là nợ hiện tại của khách (để xem ai đang nợ, vào &quot;📒 Công nợ khách&quot;).</div>
      {list.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tìm thấy khách. Bấm &quot;Thêm khách mới&quot; ở trên.</div>
      ) : (
        <div className="md:grid md:grid-cols-2 md:gap-x-3">
        {list.map((c) => (
          <button key={c.customer} onClick={() => onPick(c.customer)} className="mb-2 flex w-full items-center justify-between rounded-xl bg-white p-3.5 text-left shadow">
            <div className="min-w-0">
              <div className="font-bold">{c.customer_name}</div>
              <div className="text-slate-500">
                {c.village || ""} {c.mobile ? `· ${c.mobile}` : ""}
              </div>
            </div>
            <div className={c.debt && c.debt > 0 ? "shrink-0 font-bold text-red-600" : "shrink-0 text-slate-400"}>
              {c.debt && c.debt > 0 ? money(c.debt) : "Không nợ"}
            </div>
          </button>
        ))}
        </div>
      )}
    </div>
  );
}
