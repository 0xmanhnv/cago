"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar, goBackSmart } from "./Shared";
import { PageLoading } from "@/components/ui/Loading";
import { toast } from "@/components/ui/toast";

interface Insights {
  total: number;
  top: { q: string; count: number }[];
  gaps: { q: string; count: number; safety: boolean }[];
}

/** Per-question "approve" actions: turn a real customer question into a tappable suggestion chip,
 *  or write an FAQ answer for it — both feed the live chatbot with no rebuild (cago.api.chatbot_admin). */
function Approve({ q }: { q: string }) {
  const [faqOpen, setFaqOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);

  // Ask the live assistant to draft an answer (owner edits before saving). Safety is handled inside
  // the pipeline, so a chemical/dosage question returns the standard warning, not invented advice.
  const draft = async () => {
    setDrafting(true);
    try {
      const r = await frappeCall<{ answer: string }>("cago.api.chatbot_admin.draft_faq", { question: q });
      if (r.answer) {
        setAnswer(r.answer);
        toast.success("AI đã gợi ý — sửa lại cho đúng ý rồi bấm Lưu.");
      } else {
        toast.info("AI chưa gợi ý được câu này — bác tự viết giúp nhé.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi.");
    } finally {
      setDrafting(false);
    }
  };

  const addChip = async () => {
    setBusy(true);
    try {
      await frappeCall("cago.api.chatbot_admin.add_chip", { label: q, context: "general" });
      toast.success("Đã thêm vào gợi ý câu hỏi.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi.");
    } finally {
      setBusy(false);
    }
  };
  const saveFaq = async () => {
    if (!answer.trim()) return;
    setBusy(true);
    try {
      await frappeCall("cago.api.chatbot_admin.add_faq", { question: q, answer: answer.trim() });
      toast.success("Đã lưu câu trả lời. Trợ lý sẽ tự trả lời câu này.");
      setFaqOpen(false);
      setAnswer("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        <button onClick={addChip} disabled={busy} className="rounded-full bg-violet-100 px-2.5 py-1 text-sm font-bold text-violet-700 disabled:opacity-50">✨ Thành gợi ý</button>
        <button onClick={() => setFaqOpen((v) => !v)} disabled={busy} className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-bold text-emerald-700 disabled:opacity-50">📝 Viết câu trả lời (FAQ)</button>
      </div>
      {faqOpen && (
        <div className="mt-2">
          <button onClick={draft} disabled={busy || drafting} className="mb-2 rounded-full bg-violet-100 px-3 py-1 text-sm font-bold text-violet-700 disabled:opacity-50">
            {drafting ? "⏳ Đang soạn…" : "✨ Nhờ AI gợi ý câu trả lời"}
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="Câu trả lời cửa hàng muốn trợ lý nói… (hoặc bấm “✨ Nhờ AI gợi ý”)" className="flex-1 rounded-lg border-2 border-emerald-300 p-2.5 text-sm" />
            <button onClick={saveFaq} disabled={busy || !answer.trim()} className="shrink-0 rounded-lg bg-brand px-4 py-2 font-extrabold text-white disabled:opacity-50">Lưu</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Trợ lý học gì" — what customers actually asked the assistant, so the owner can teach it:
 *  the most-asked questions, and the GAPS it couldn't answer (→ add a product / nickname / label). */
export function AssistantInsights() {
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [d, setD] = useState<Insights | null>(null);

  useEffect(() => {
    setD(null);
    frappeCall<Insights>("cago.api.reports.assistant_insights", { days }, { method: "GET" }).then(setD).catch(() => setD({ total: 0, top: [], gaps: [] }));
  }, [days]);

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="🤖 Trợ lý học gì" />
      <div className="mb-3 flex gap-2">
        {([[1, "Hôm nay"], [7, "7 ngày"], [30, "30 ngày"]] as const).map(([n, label]) => (
          <button key={n} onClick={() => setDays(n)} className={`rounded-full border px-3.5 py-1.5 text-sm font-bold ${days === n ? "border-brand bg-brand text-white" : "border-emerald-300 bg-brand-light text-brand-dark"}`}>
            {label}
          </button>
        ))}
      </div>

      {!d ? (
        <PageLoading />
      ) : (
        <>
          <div className="mb-3 rounded-xl bg-emerald-50 p-2.5 text-center text-sm font-bold text-emerald-800">{d.total} câu hỏi của khách</div>

          {/* GAPS first — these are the actionable items: questions the assistant couldn't answer. */}
          <h2 className="mb-1.5 ml-1 font-extrabold text-amber-700">🧩 Câu hỏi trợ lý CHƯA trả lời được</h2>
          <p className="mb-2 ml-1 text-sm text-slate-500">Bổ sung dữ liệu để lần sau trợ lý tự trả lời: thêm sản phẩm, thêm tên gọi/biệt danh, hoặc ghi “Hướng dẫn trên nhãn” trong Sửa sản phẩm.</p>
          {d.gaps.length === 0 ? (
            <div className="mb-4 rounded-xl bg-white p-4 text-center text-slate-400">Không có câu nào bị bỏ sót. 👍</div>
          ) : (
            <div className="mb-4 space-y-2">
              {d.gaps.map((g, i) => (
                <div key={i} className="rounded-xl border border-amber-100 bg-white p-3 shadow-sm">
                  <div className="font-medium text-[#1b2733]">“{g.q}”</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-800">hỏi {g.count} lần</span>
                    {g.safety ? (
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 font-bold text-red-700">⚠️ an toàn — cần người tư vấn</span>
                    ) : (
                      // Open Sản phẩm so the owner can search/add the missing item — don't prefill the
                      // whole question (it isn't a product name, e.g. "Còn hàng không?" → always empty).
                      <button onClick={() => router.push("/pos/products")} className="rounded-full bg-brand-light px-2.5 py-0.5 font-bold text-brand-dark">🔎 Mở Sản phẩm để bổ sung</button>
                    )}
                  </div>
                  {!g.safety && <Approve q={g.q} />}
                </div>
              ))}
            </div>
          )}

          <h2 className="mb-1.5 ml-1 font-extrabold text-brand-dark">🔥 Câu hỏi nhiều nhất</h2>
          {d.top.length === 0 ? (
            <div className="rounded-xl bg-white p-4 text-center text-slate-400">Chưa có câu hỏi nào.</div>
          ) : (
            <div className="space-y-2">
              {d.top.map((t, i) => (
                <div key={i} className="rounded-xl bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#1b2733]">“{t.q}”</span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-bold text-slate-500">{t.count}×</span>
                  </div>
                  <Approve q={t.q} />
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-center text-xs text-slate-400">Những câu hỏi phổ biến tự động thành gợi ý bấm-nhanh trên màn hỏi trợ lý của khách.</p>
        </>
      )}
    </div>
  );
}
