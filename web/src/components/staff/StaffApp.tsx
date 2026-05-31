"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall, logout } from "@/lib/api";
import { useSession } from "@/lib/session";
import { mdLight } from "@/lib/kioskUi";
import type { ChatResponse, Product, ProductCard } from "@/lib/types";

type View = "home" | "search" | "detail" | "wanted" | "chat";

const STATUS_VI: Record<string, string> = {
  New: "Mới",
  Processing: "Đang xử lý",
  Completed: "Hoàn tất",
  Expired: "Hết hạn",
};

export function StaffApp() {
  const router = useRouter();
  const { boot } = useSession();
  const [view, setView] = useState<View>("home");

  const doLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="mx-auto max-w-[760px] p-4 text-[18px] text-[#1b2733]">
      {view === "home" && (
        <Home onNav={setView} hasPos={!!boot?.has_posawesome} onLogout={doLogout} />
      )}
      {view === "search" && <Search onBack={() => setView("home")} />}
      {view === "wanted" && <Wanted onBack={() => setView("home")} />}
      {view === "chat" && <StaffChat onBack={() => setView("home")} />}
    </div>
  );
}

function Btn({ onClick, color, children }: { onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[84px] items-center justify-center rounded-2xl p-2.5 text-center text-[19px] font-bold text-white ${color}`}
    >
      {children}
    </button>
  );
}

function Home({
  onNav,
  hasPos,
  onLogout,
}: {
  onNav: (v: View) => void;
  hasPos: boolean;
  onLogout: () => void;
}) {
  return (
    <div>
      <div className="my-4 text-center text-2xl font-bold">NHÂN VIÊN BÁN HÀNG</div>
      <div className="grid grid-cols-2 gap-3.5">
        <Btn onClick={() => onNav("search")} color="bg-blue-600">
          🔎 Tra sản phẩm
        </Btn>
        <Btn onClick={() => onNav("wanted")} color="bg-teal-600">
          📋 Khách đã chọn
        </Btn>
        <Btn onClick={() => onNav("chat")} color="bg-violet-600">
          🤖 Hỏi trợ lý
        </Btn>
        <a
          href="/app/point-of-sale"
          className="flex min-h-[84px] items-center justify-center rounded-2xl bg-brand p-2.5 text-center text-[19px] font-bold text-white"
        >
          🛒 Mở POS gốc
        </a>
        {hasPos && (
          <a
            href="/app/posawesome"
            className="flex min-h-[84px] items-center justify-center rounded-2xl bg-slate-500 p-2.5 text-center text-[19px] font-bold text-white"
          >
            🧾 Mở POS Awesome
          </a>
        )}
      </div>
      <button
        onClick={onLogout}
        className="mt-3.5 min-h-touch w-full rounded-2xl bg-red-600 py-3.5 text-lg font-bold text-white"
      >
        🚪 Đăng xuất
      </button>
    </div>
  );
}

function BackBar({ onBack, title }: { onBack: () => void; title?: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <button onClick={onBack} className="rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
        ← Trang chủ
      </button>
      {title && <div className="flex-1 text-xl font-bold">{title}</div>}
    </div>
  );
}

function Search({ onBack }: { onBack: () => void }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Product | null>(null);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = async (query: string) => {
    setLoading(true);
    try {
      const r = await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query }, { method: "GET" });
      setList(r || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void run("");
  }, []);

  const open = async (code: string) => {
    const p = await frappeCall<Product>("cago.api.staff.get_product", { item_code: code }, { method: "GET" });
    setDetail(p);
  };

  if (detail) return <StaffDetail product={detail} onBack={() => setDetail(null)} />;

  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2.5">
        <button onClick={onBack} className="rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ← Trang chủ
        </button>
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            clearTimeout(tRef.current);
            tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
          }}
          placeholder="Tên, tên hay gọi, màu, công dụng..."
          className="flex-1 rounded-xl border-2 border-slate-300 p-3.5 text-lg"
        />
      </div>
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : list.length === 0 ? (
        <div className="text-slate-500">Không tìm thấy.</div>
      ) : (
        list.map((p) => (
          <button
            key={p.item_code}
            onClick={() => open(p.item_code)}
            className="mb-3 flex w-full gap-3 rounded-xl bg-white p-3.5 text-left shadow"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.image && <img src={p.image} alt="" className="h-[76px] w-[76px] rounded-lg object-cover" />}
            <div>
              <div className="font-bold">{p.display_name}</div>
              <div className="font-bold text-brand">{p.price_text}</div>
              <div className="text-slate-500">
                {p.stock_status} {p.category ? `· ${p.category}` : ""}
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-2">
      <span className="text-slate-500">{k}</span>
      <b className="text-right">{v}</b>
    </div>
  );
}

function StaffDetail({ product: p, onBack }: { product: Product; onBack: () => void }) {
  const alts = p.alternatives || {};
  const altBlock = (label: string, arr?: { display_name: string; note?: string }[]) =>
    arr && arr.length ? (
      <div>
        <div className="mt-3.5 font-bold">{label}</div>
        {arr.map((a, i) => (
          <div key={i} className="my-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
            <b>{a.display_name}</b>
            {a.note ? ` — ${a.note}` : ""}
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div>
      <BackBar onBack={onBack} />
      <div className="rounded-xl bg-white p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.image && <img src={p.image} alt="" className="max-h-60 w-full rounded-lg bg-slate-100 object-contain" />}
        <h2 className="mt-2 text-xl font-bold">{p.display_name}</h2>
        <div className="text-3xl font-extrabold text-brand">{p.price_text}</div>
        <Row k="Tồn kho" v={`${p.stock_status || "-"} (${p.actual_stock_qty ?? 0})`} />
        <Row k="Vị trí để hàng" v={p.shelf_location || "-"} />
        <Row k="Tên hay gọi" v={p.local_names || "-"} />
        <Row k="Dùng cho" v={p.use_cases || "-"} />
        {p.expiry_text && <Row k="Hạn sử dụng" v={`${p.expiry_text}${p.expiry_status === "expired" ? " (đã hết hạn)" : p.expiry_status === "near" ? " (sắp hết hạn)" : ""}`} />}
        {p.staff_advice && (
          <>
            <div className="mt-3.5 font-bold">Tư vấn</div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">{p.staff_advice}</div>
          </>
        )}
        {altBlock("Rẻ hơn", alts.cheaper)}
        {altBlock("Tương đương", alts.equivalent)}
        {altBlock("Tốt hơn", alts.better)}
        {altBlock("Tránh dùng cùng", alts.avoid)}
        {p.call_owner_when && (
          <div className="mt-3 rounded-lg border border-red-400 bg-red-100 p-3 text-red-900">
            📞 Gọi chủ khi: {p.call_owner_when}
          </div>
        )}
        {p.safety_notes && (
          <div className="mt-3 rounded-lg border border-amber-400 bg-amber-100 p-3 text-amber-900">⚠️ {p.safety_notes}</div>
        )}
      </div>
    </div>
  );
}

interface WantedItem {
  display_name: string;
  qty: number;
  shelf_location?: string;
  price_text: string;
}
interface WantedList {
  code: string;
  status: string;
  is_expired?: boolean;
  note?: string;
  items: WantedItem[];
}

function Wanted({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState("");
  const [wl, setWl] = useState<WantedList | null>(null);
  const [msg, setMsg] = useState("");

  const lookup = async () => {
    if (!code.trim()) return;
    setMsg("");
    setWl(null);
    try {
      const r = await frappeCall<WantedList>("cago.api.staff.get_wanted_list", { code: code.trim() }, { method: "GET" });
      setWl(r);
    } catch {
      setMsg("Không tìm thấy đơn với mã này.");
    }
  };
  const setStatus = async (status: string) => {
    if (!wl) return;
    const r = await frappeCall<{ status: string }>("cago.api.staff.set_wanted_list_status", { code: wl.code, status });
    setWl({ ...wl, status: r.status });
  };

  return (
    <div>
      <BackBar onBack={onBack} />
      <input
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && lookup()}
        placeholder="VD: WL-2026-00001"
        className="mb-2.5 w-full rounded-xl border-2 border-slate-300 p-3.5 text-lg"
      />
      <button onClick={lookup} className="min-h-touch w-full rounded-2xl bg-teal-600 py-3 text-lg font-bold text-white">
        Tìm đơn
      </button>
      {msg && <div className="mt-3 rounded-lg border border-amber-400 bg-amber-100 p-3 text-amber-900">{msg}</div>}
      {wl && (
        <div className="mt-3.5 rounded-xl bg-white p-4">
          <h3 className="text-lg font-bold">
            Đơn {wl.code}{" "}
            <span className="ml-1 inline-block rounded-full bg-slate-200 px-2.5 py-1 text-sm">
              {STATUS_VI[wl.status] || wl.status}
            </span>
          </h3>
          {wl.is_expired && (
            <div className="my-2 rounded-lg border border-amber-400 bg-amber-100 p-3 text-amber-900">
              ⏰ Đơn đã quá hạn (&gt;2 ngày), nên xác nhận lại với khách.
            </div>
          )}
          {wl.note && <div className="text-slate-500">{wl.note}</div>}
          {wl.items.map((i, idx) => (
            <div key={idx} className="flex justify-between gap-3 border-b border-slate-100 py-2">
              <span>
                <b>{i.display_name}</b>
                <br />
                <span className="text-slate-500">
                  SL: {i.qty} {i.shelf_location ? `· ${i.shelf_location}` : ""}
                </span>
              </span>
              <b>{i.price_text}</b>
            </div>
          ))}
          <div className="mt-3 flex gap-2.5">
            <button onClick={() => setStatus("Processing")} className="min-h-[48px] flex-1 rounded-xl bg-blue-600 font-bold text-white">
              ⏳ Đang xử lý
            </button>
            <button onClick={() => setStatus("Completed")} className="min-h-[48px] flex-1 rounded-xl bg-brand font-bold text-white">
              ✅ Hoàn tất
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffChat({ onBack }: { onBack: () => void }) {
  const [hist, setHist] = useState<{ who: "user" | "bot"; text: string; cards?: ProductCard[] }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [hist, sending]);

  const ask = async (text: string) => {
    const t = text.trim();
    if (!t || sending) return;
    const next = [...hist, { who: "user" as const, text: t }];
    setHist(next);
    setInput("");
    setSending(true);
    const h = next.slice(-6).map((m) => ({ role: m.who === "user" ? "user" : "assistant", content: m.text }));
    try {
      const r = await frappeCall<ChatResponse>("cago.api.chatbot.ask_staff", { message: t, history: JSON.stringify(h) });
      setHist([...next, { who: "bot", text: r.answer_text, cards: r.product_cards }]);
    } catch {
      setHist([...next, { who: "bot", text: "Có lỗi, thử lại nhé." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <BackBar onBack={onBack} title="🤖 Trợ lý" />
      <div ref={logRef} className="max-h-[60vh] overflow-y-auto">
        {hist.length === 0 && <div className="text-slate-500">Hỏi nhanh: giá, tồn, vị trí kệ, tư vấn, sản phẩm thay thế...</div>}
        {hist.map((m, i) =>
          m.who === "user" ? (
            <div key={i} className="my-2 text-right">
              <span className="inline-block max-w-[85%] rounded-2xl bg-blue-600 px-3.5 py-2.5 text-left text-white">{m.text}</span>
            </div>
          ) : (
            <div key={i} className="my-2">
              <div className="whitespace-pre-line rounded-2xl bg-white p-3 shadow-sm" dangerouslySetInnerHTML={{ __html: mdLight(m.text) }} />
            </div>
          ),
        )}
        {sending && <div className="my-2 text-slate-500">⌛ đang trả lời...</div>}
      </div>
      <div className="mt-2.5 flex gap-2">
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(input)}
          placeholder="Nhập câu hỏi..."
          className="flex-1 rounded-xl border-2 border-slate-300 p-3.5 text-lg"
        />
        <button onClick={() => ask(input)} disabled={sending} className="rounded-xl bg-brand px-5 font-bold text-white disabled:opacity-50">
          Gửi
        </button>
      </div>
    </div>
  );
}
