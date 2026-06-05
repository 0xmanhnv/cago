"use client";

import { useEffect, useRef, useState } from "react";
import { frappeCall } from "@/lib/api";
import { confirmDialog } from "@/components/ui/dialog";
import { useSession } from "@/lib/session";
import { useKiosk } from "@/store/kiosk";
import { catIcon, mdLight, normalizePhone, validPhone } from "@/lib/kioskUi";
import type { ChatResponse, KioskChips } from "@/lib/types";

// Extra category chips by the KIND of category the customer is browsing (slug-matched), so the
// suggestions fit cám vs phân vs thuốc vs giống instead of being generic.
function categoryKindChips(focusCat: string): string[] {
  const s = (focusCat || "").toLowerCase();
  if (s.includes("cam") || s.includes("cám")) return ["Cho con gì ăn?", "Bao nhiêu kg một bao?"];
  if (s.includes("phan") || s.includes("phân")) return ["Bón cho cây gì?", "Loại nào tốt cho lúa?"];
  if (s.includes("thuoc") || s.includes("thuốc")) return ["Trị bệnh/sâu gì?", "Dùng an toàn thế nào?"];
  if (s.includes("giong") || s.includes("giống") || s.includes("hat") || s.includes("hạt")) return ["Trồng mùa nào?", "Gieo/ươm thế nào?"];
  return [];
}

function pickChips(chips: KioskChips | undefined, focusItem: string, focusCat: string, opts?: { storeMap?: boolean }): string[] {
  if (!chips) return [];
  const dedup = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).slice(0, 8);
  if (focusItem) {
    // A product is on screen → questions about it, + "where is it" when the shop has a map.
    return dedup([...(chips.product || []), ...(opts?.storeMap ? ["📍 Ở đâu trong cửa hàng?"] : [])]);
  }
  if (focusCat) return dedup([...(chips.category || []), ...categoryKindChips(focusCat)]);
  return dedup(chips.general || []);
}

export function Assistant({
  onClose,
  onBack,
  onOpenProduct,
  onOpenCategory,
  onCallStaff,
}: {
  onClose: () => void; // "Xong / Khách mới" → reset + home
  onBack: () => void; // "‹ Quay lại" → the page the customer opened the assistant from
  onOpenProduct: (code: string) => void;
  onOpenCategory: (category: string) => void; // tap a category in the "we sell X" reply
  onCallStaff: (prefill?: { reason?: string; question?: string }) => void;
}) {
  const { boot } = useSession();
  const persona = boot?.persona;
  const {
    sessionId,
    phone,
    history,
    pushMsg,
    setPhone,
    newSession,
    focusItem,
    focusName,
    focusCat,
    clearFocus,
  } = useKiosk();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showChips, setShowChips] = useState(false); // suggestions collapsed by default (Grab-style)
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneVal, setPhoneVal] = useState(phone);
  const [phoneErr, setPhoneErr] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, sending]);

  const ask = async (text: string) => {
    const t = text.trim();
    if (!t || sending) return;
    pushMsg({ who: "user", text: t });
    setInput("");
    setSending(true);
    const hist = [...history, { who: "user" as const, text: t }]
      .filter((m) => m.text)
      .slice(-6)
      .map((m) => ({ role: m.who === "user" ? "user" : "assistant", content: m.text }));
    try {
      const r = await frappeCall<ChatResponse>("cago.api.chatbot.ask_kiosk", {
        message: t,
        history: JSON.stringify(hist),
        session_id: sessionId,
        phone: phone || null,
        focus_item: focusItem || null,
        focus_category: focusCat || null,
      });
      pushMsg({
        who: "bot",
        text: r.answer_text,
        cards: r.product_cards,
        cats: r.categories,
        warnings: r.safety_warnings,
        needStaff: r.needs_staff_help,
      });
      // Assistant refused (safety) → proactively open the phone box so the customer can leave a
      // number for the owner / a qualified person to call back. Better UX than a button to tap.
      if (r.needs_staff_help && !phone) setPhoneOpen(true);
    } catch {
      pushMsg({ who: "bot", text: "Xin lỗi, có lỗi kết nối. Bác thử lại nhé." });
    } finally {
      setSending(false);
    }
  };

  const savePhone = () => {
    const raw = phoneVal.trim();
    if (raw && !validPhone(raw)) {
      setPhoneErr(true);
      return;
    }
    setPhone(raw ? normalizePhone(raw) : "");
    setPhoneErr(false);
    setPhoneOpen(false);
  };

  return (
    // Phone / kiosk tablet: full-screen (right for touch). PC / big screen (xl): a floating chat
    // window docked bottom-right (Messenger-style) — it does NOT cover the page, so the screen
    // behind stays visible and clickable. No backdrop; close via the header buttons.
    <div className="animate-sheet-up fixed inset-0 z-[60] flex flex-col bg-[#f0fdf4] will-change-transform xl:inset-auto xl:bottom-4 xl:right-4 xl:h-[640px] xl:max-h-[calc(100vh-2rem)] xl:w-[400px] xl:origin-bottom-right xl:animate-chat-pop xl:overflow-hidden xl:rounded-2xl xl:border xl:border-emerald-200 xl:shadow-2xl">
      {/* header — brand gradient bar. Back (subtle) · identity (name + role, never truncated to "Trợ…")
          · "Khách mới" reset (the important kiosk action — clear label, not a loud ambiguous "Xong"). */}
      <div className="flex items-center gap-2 bg-gradient-to-r from-brand to-brand-dark px-3 py-2 text-white shadow-card">
        <button
          onClick={onBack}
          aria-label="Quay lại"
          className="shrink-0 whitespace-nowrap rounded-xl bg-white/25 px-3 py-2.5 font-extrabold text-white active:bg-white/40"
        >
          ‹
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-xl">🤖</span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-base font-extrabold">{persona?.name || "Trợ lý"}</div>
            <div className="truncate text-[11px] font-medium text-white/80">Trợ lý cửa hàng</div>
          </div>
        </div>
        <button
          onClick={async () => {
            if (await confirmDialog("Kết thúc và xoá cuộc trò chuyện cho khách mới?", { confirmLabel: "Khách mới" })) {
              newSession();
              onClose();
            }
          }}
          className="shrink-0 whitespace-nowrap rounded-xl bg-harvest px-3.5 py-2.5 text-sm font-extrabold text-white active:brightness-95"
          title="Bắt đầu cho khách mới"
        >
          🔄 Khách mới
        </button>
      </div>

      {/* focus banner */}
      {focusItem && (
        <div className="flex items-center gap-2 border-b border-brand-light bg-emerald-50 px-3 py-2 text-sm text-brand-dark">
          🔎 Đang hỏi về: <b>{focusName || "sản phẩm này"}</b>
          <button
            onClick={clearFocus}
            className="ml-auto h-8 w-8 rounded-full bg-brand-light text-base font-extrabold text-brand-dark"
            title="Hỏi chung"
          >
            ✕
          </button>
        </div>
      )}

      {/* log — overscroll-contain stops wheel/touch scroll from chaining to the page behind the
          popup once the log hits its top/bottom (so the background doesn't move under the chat). */}
      <div ref={logRef} className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {history.length === 0 && (
          // Warm welcome + big tappable example questions, so a low-tech customer can start by
          // TAPPING (not typing) and the screen never feels empty/broken.
          <div className="animate-fade-in">
            <div className="flex items-start gap-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-light text-2xl">🤖</span>
              <div className="rounded-2xl rounded-tl-sm bg-white p-3 text-slate-700 shadow-sm">
                Dạ {persona?.pronoun || "cháu"} là <b>{persona?.name || "trợ lý"}</b>
                {persona?.relation ? ` — ${persona.relation}` : ""}, trợ lý của cửa hàng. Bác cần hỏi gì về sản phẩm,
                giá, cách dùng ạ?
              </div>
            </div>
            {(() => {
              const chips = pickChips(boot?.kiosk_chips, focusItem, focusCat, { storeMap: boot?.store_map });
              if (!chips.length) return null;
              return (
                <div className="ml-12 mt-3">
                  <div className="mb-1.5 text-xs font-bold text-slate-400">Bác bấm nhanh một câu nhé:</div>
                  <div className="grid gap-2">
                    {chips.slice(0, 6).map((c) => (
                      <button
                        key={c}
                        disabled={sending}
                        onClick={() => ask(c)}
                        className="rounded-xl border border-emerald-200 bg-white px-3.5 py-3 text-left font-bold text-brand-dark shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:shadow-card disabled:opacity-50"
                      >
                        💬 {c}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
        {history.map((m, i) =>
          m.who === "user" ? (
            <div key={m.id ?? i} className="my-2 text-right">
              <span className="inline-block max-w-[85%] whitespace-pre-line break-words rounded-2xl bg-brand px-4 py-2.5 text-left text-white">
                {m.text}
              </span>
            </div>
          ) : (
            <div key={m.id ?? i} className="my-2">
              <div
                className="whitespace-pre-line rounded-2xl bg-white p-3 shadow-sm"
                dangerouslySetInnerHTML={{ __html: mdLight(m.text) }}
              />
              {/* "We sell X" reply: each category is a tappable row → that category's product list. */}
              {(m.cats || []).length > 0 && (
                <div className="mt-2 grid gap-1.5">
                  {m.cats!.map((c) => (
                    <button
                      key={c.category}
                      onClick={() => onOpenCategory(c.category)}
                      className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-white px-3.5 py-3 text-left font-bold text-brand-dark shadow-sm transition hover:-translate-y-0.5 hover:shadow-card"
                    >
                      <span className="text-2xl">{c.icon || "📦"}</span>
                      <span className="flex-1">{c.category}</span>
                      <span className="text-xl text-slate-300">›</span>
                    </button>
                  ))}
                </div>
              )}
              {(m.cards || []).map((c) => (
                <div key={c.item_code} className="mt-2 flex items-center gap-2 rounded-xl bg-white p-2.5 shadow-sm">
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt="" className="h-[60px] w-[60px] rounded-lg object-cover" />
                  ) : (
                    <div
                      className="flex h-[60px] w-[60px] items-center justify-center rounded-lg text-2xl"
                      style={{ background: c.category_color || "#e6f4ea" }}
                    >
                      {catIcon(c.category_icon)}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-bold">{c.display_name}</div>
                    <div className="font-extrabold text-brand">{c.price_text}</div>
                    <div className="text-sm text-slate-500">{c.stock_status}</div>
                  </div>
                  <button
                    onClick={() => onOpenProduct(c.item_code)}
                    className="rounded-lg bg-brand px-3.5 py-2 font-bold text-white"
                  >
                    Xem / Chọn →
                  </button>
                </div>
              ))}
              {(m.warnings || []).map((w, j) => (
                <div key={j} className="mt-2 rounded-xl border border-amber-400 bg-amber-100 p-3 text-amber-900">
                  ⚠️ {w}
                </div>
              ))}
              {m.needStaff && (
                <div className="mt-2.5 flex flex-col gap-2">
                  <button
                    onClick={() => {
                      // Carry the last thing the customer asked so staff arrive knowing the question.
                      const lastQ = [...history].reverse().find((h) => h.who === "user")?.text;
                      onCallStaff({ reason: "Trợ lý chưa trả lời được", question: lastQ });
                    }}
                    className="w-full rounded-xl bg-red-600 px-4 py-3 font-extrabold text-white"
                  >
                    📞 Gọi người bán
                  </button>
                  {!phone && (
                    // A safety question we couldn't answer → invite the customer to leave a number so
                    // the owner can call back to advise (shows up in "Câu hỏi cần lưu ý").
                    <button onClick={() => setPhoneOpen(true)} className="w-full rounded-xl border-2 border-emerald-300 bg-brand-light px-4 py-2.5 font-bold text-brand-dark">
                      📝 Để lại SĐT để chủ gọi tư vấn
                    </button>
                  )}
                </div>
              )}
            </div>
          ),
        )}
        {sending && (
          <div className="my-2">
            <div className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-4 py-3.5 shadow-sm">
              <Dot /> <Dot delay="0.2s" /> <Dot delay="0.4s" />
            </div>
          </div>
        )}
      </div>

      {/* inline optional phone */}
      <div className="px-3 pt-1.5">
        {phoneOpen ? (
          <div>
            <div className="mb-1.5 text-sm font-bold text-brand-dark">📞 Nhập số điện thoại để chủ / người có chuyên môn gọi lại tư vấn:</div>
            {/* Input on its own full-width line (numeric keypad, "Xong" key), then a clean Lưu + Huỷ
                row with matching heights — no cramped 3-in-a-row, easier for older customers. */}
            <input
              autoFocus
              type="tel"
              inputMode="tel"
              enterKeyHint="done"
              maxLength={15}
              value={phoneVal}
              onChange={(e) => setPhoneVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && savePhone()}
              placeholder="VD: 0987 654 321"
              className={`h-12 w-full rounded-xl border-2 px-3.5 text-lg ${phoneErr ? "border-red-400" : "border-emerald-300"}`}
            />
            {phoneErr && <span className="mt-1 block px-0.5 text-xs text-red-600">Số điện thoại chưa đúng (vd 0987654321).</span>}
            <div className="mt-2 flex gap-2">
              <button onClick={savePhone} className="h-12 flex-1 rounded-xl bg-brand text-lg font-extrabold text-white active:brightness-95">
                Lưu số
              </button>
              <button onClick={() => setPhoneOpen(false)} className="h-12 rounded-xl bg-slate-100 px-5 font-bold text-slate-600">
                Huỷ
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              setPhoneVal(phone);
              setPhoneOpen(true);
            }}
            className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-emerald-700/80 hover:text-emerald-800"
          >
            {phone ? `📞 SĐT đã lưu: ${phone} — sửa` : "📞 Để lại SĐT để được gọi lại (không bắt buộc)"}
          </button>
        )}
      </div>

      {/* Suggestions — collapsed by default (Grab-style "Đề xuất thông minh"): a slim toggle bar the
          customer taps to reveal the chip strip, so it doesn't crowd the chat. */}
      {(() => {
        const chips = pickChips(boot?.kiosk_chips, focusItem, focusCat, { storeMap: boot?.store_map });
        // When the chat is empty the welcome card already shows the chips — don't duplicate them here.
        if (!chips.length || history.length === 0) return null;
        return (
          <div className="border-t border-brand-light bg-[#f0fdf4]">
            <button
              onClick={() => setShowChips((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-bold text-brand-dark"
            >
              <span>✨ Gợi ý câu hỏi</span>
              <span className={`transition-transform duration-200 ${showChips ? "rotate-180" : ""}`}>⌄</span>
            </button>
            {showChips && (
              <div className="relative">
                <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-2">
                  {chips.map((c) => (
                    <button
                      key={c}
                      disabled={sending}
                      onClick={() => { setShowChips(false); ask(c); }}
                      className="flex-none whitespace-nowrap rounded-full border border-emerald-300 bg-brand-light px-3.5 py-2 text-sm font-bold text-brand-dark disabled:opacity-50"
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#f0fdf4] to-transparent" />
              </div>
            )}
          </div>
        );
      })()}

      {/* composer */}
      <div className="flex gap-2 border-t border-brand-light bg-white px-3 py-2.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask(input)}
          placeholder="Nhập câu hỏi..."
          className="flex-1 rounded-xl border-2 border-emerald-300 p-3.5 text-base"
        />
        <button
          onClick={() => ask(input)}
          disabled={sending}
          className="rounded-xl bg-brand px-5 font-extrabold text-white disabled:opacity-50"
        >
          Gửi
        </button>
      </div>
    </div>
  );
}

function Dot({ delay = "0s" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 animate-bounce rounded-full bg-slate-400"
      style={{ animationDelay: delay }}
    />
  );
}
