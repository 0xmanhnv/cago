"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { mdLight } from "@/lib/kioskUi";
import { BackBar } from "@/components/owner/Shared";
import type { ChatResponse, ProductCard } from "@/lib/types";

export function Chat() {
  const router = useRouter();
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
      <BackBar title="🤖 Trợ lý" onBack={() => (typeof window !== "undefined" && window.history.length > 1 ? router.back() : router.push("/pos"))} />
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
              {(m.cards || []).map((c) => (
                <button
                  key={c.item_code}
                  onClick={() => router.push(`/pos/products/${encodeURIComponent(c.item_code)}`)}
                  className="mt-2 flex w-full items-center gap-3 rounded-xl bg-white p-2.5 text-left shadow"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.image && <img src={c.image} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                  <div className="flex-1">
                    <div className="font-bold">{c.display_name}</div>
                    <div className="font-bold text-brand">{c.price_text}</div>
                  </div>
                </button>
              ))}
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
