"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog, alertDialog } from "@/components/ui/dialog";
import { copyText, formatVnd, groupVnd, parseVnd } from "@/lib/utils";
import { Sheet } from "@/components/ui/Sheet";
import { CatThumb } from "@/components/kiosk/CatThumb";
import type { ProductCard } from "@/lib/types";

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
 * Shared top bar. The arrow goes to the previous step: pass `onBack` for an in-flow sub-step (e.g.
 * back to a picker), or omit it on a top-level screen to get smart history-back. A persistent 🏠
 * Home button is ALWAYS shown so home is one tap from anywhere, however deep the user has gone.
 */
// The ONE shared POS/owner header (back + title + optional action + 🏠 home), used across every
// /pos screen so a header redesign happens in one place. The kiosk has its OWN header set under
// components/kiosk — intentionally separate so kiosk can be restyled without touching POS.
// `right` is an optional trailing action (rendered before 🏠) for screens that need one.
export function BackBar({ onBack, title, label = "Quay lại", right }: { onBack?: () => void; title?: string; label?: string; right?: React.ReactNode }) {
  const router = useRouter();
  const back = onBack ?? (() => goBackSmart(router));
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <button onClick={back} className="mt-backbtn">
        ‹ {label}
      </button>
      {title && <div className="mt-title flex-1">{title}</div>}
      {right}
      <button
        onClick={() => router.push("/pos")}
        aria-label="Về trang chủ"
        title="Về trang chủ"
        className="shrink-0 rounded-xl bg-slate-100 px-3.5 py-3 text-xl leading-none text-slate-600"
      >
        🏠
      </button>
    </div>
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
export function ProductPicker({ title, onBack, onPick }: { title: string; onBack: () => void; onPick: (code: string) => void }) {
  const [list, setList] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
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
  return (
    <div>
      <BackBar onBack={onBack} />
      <input
        autoFocus
        onChange={(e) => {
          clearTimeout(tRef.current);
          tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
        }}
        placeholder="Tên, tên hay gọi, màu bao..."
        className="mb-2 w-full rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
      />
      <input
        placeholder="⌨ Quét/nhập mã vạch rồi Enter"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            void findBarcode((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = "";
          }
        }}
        className="mb-2 w-full rounded-xl border-2 border-emerald-300 p-3 text-base"
      />
      <div className="text-xl font-bold text-brand-dark">{title}</div>
      {loading ? (
        <PageLoading />
      ) : list.length === 0 ? (
        <div className="text-slate-500">Không tìm thấy.</div>
      ) : (
        <div className="xl:grid xl:grid-cols-2 xl:gap-x-3">
        {list.map((p) => (
          <button key={p.item_code} onClick={() => onPick(p.item_code)} className="mb-3 flex w-full items-center gap-3 rounded-xl bg-white p-3.5 text-left shadow">
            <div className="h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg">
              <CatThumb image={p.image} icon={p.category_icon} color={p.category_color} name={p.display_name} variant="thumb" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold leading-tight">{p.display_name}</div>
              <div className="font-bold text-brand">{p.price_text}</div>
              <div className="text-slate-500">{p.stock_status}</div>
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
        <BackBar onBack={() => setAdding(false)} label="Quay lại" title="THÊM KHÁCH MỚI" />
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
      <input
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          clearTimeout(tRef.current);
          tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
        }}
        placeholder="Tên khách, xóm..."
        className="mb-2 w-full rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
      />
      <div className="text-xl font-bold text-brand-dark">{title}</div>
      <div className="mb-1 text-sm text-slate-500">Chọn khách để thực hiện — số bên phải là nợ hiện tại của khách (để xem ai đang nợ, vào &quot;📒 Công nợ khách&quot;).</div>
      {list.length === 0 ? (
        <div className="my-2 text-slate-500">Không tìm thấy khách. Bấm &quot;Thêm khách mới&quot; bên dưới.</div>
      ) : (
        <div className="xl:grid xl:grid-cols-2 xl:gap-x-3">
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
      <button onClick={() => setAdding(true)} className="mt-2.5 min-h-touch w-full rounded-xl bg-teal-600 font-extrabold text-white">
        ➕ Thêm khách mới
      </button>
    </div>
  );
}
