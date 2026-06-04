"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar, goBackSmart } from "./OwnerShared";
import { PageLoading } from "@/components/ui/Loading";
import { toast } from "@/components/ui/toast";

type Faq = { question: string; answer: string; is_active: number };
type Chip = { context: string; label: string };
type Syn = { intent_group: string; term: string };
type Settings = { faq: Faq[]; chips: Chip[]; synonyms: Syn[] };

const CTX_LABEL: Record<string, string> = { general: "Màn mở đầu", category: "Khi xem loại hàng", product: "Khi xem sản phẩm" };
const GROUP_LABEL: Record<string, string> = { overview: "Bán những gì", bestseller: "Bán chạy", where: "Ở đâu" };

/** Owner-curated chatbot knowledge — FAQ answers, suggestion chips, keyword synonyms. Live, no
 *  rebuild (cago.api.chatbot_admin). Pairs with "Trợ lý học gì" (insights → approve into here). */
export function ChatbotContent() {
  const router = useRouter();
  const [d, setD] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    frappeCall<Settings>("cago.api.chatbot_admin.get_settings", {}).then(setD).catch(() => setD({ faq: [], chips: [], synonyms: [] }));
  }, []);

  const save = async () => {
    if (!d) return;
    setSaving(true);
    try {
      const clean = await frappeCall<Settings>("cago.api.chatbot_admin.save_settings", {
        faq: JSON.stringify(d.faq.filter((f) => f.question.trim() && f.answer.trim())),
        chips: JSON.stringify(d.chips.filter((c) => c.label.trim())),
        synonyms: JSON.stringify(d.synonyms.filter((s) => s.term.trim())),
      });
      setD(clean);
      toast.success("Đã lưu. Trợ lý cập nhật ngay.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi lưu.");
    } finally {
      setSaving(false);
    }
  };

  if (!d) return <PageLoading />;
  const set = (patch: Partial<Settings>) => setD({ ...d, ...patch });

  return (
    <div className="pb-24">
      <BackBar onBack={() => goBackSmart(router)} title="✍️ Dạy trợ lý trả lời" />
      <p className="mb-3 ml-1 text-sm text-slate-500">Cửa hàng tự dạy trợ lý: câu trả lời sẵn (FAQ), gợi ý câu hỏi cho khách bấm, và cách gọi khác của khách. Lưu là áp dụng ngay, không cần build lại.</p>

      {/* FAQ */}
      <Section title="📝 Câu trả lời sẵn (FAQ)" hint="Khách hỏi khớp từ khoá ở cột trái → trợ lý trả lời đúng câu bên phải.">
        {d.faq.map((f, i) => (
          <div key={i} className="mb-2 rounded-xl border border-slate-200 bg-white p-2.5">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={f.question} onChange={(e) => { const a = [...d.faq]; a[i] = { ...f, question: e.target.value }; set({ faq: a }); }} placeholder="khách hỏi (vd: giao hàng)" className="rounded-lg border-2 border-emerald-200 p-2 text-sm sm:w-1/3" />
              <textarea value={f.answer} onChange={(e) => { const a = [...d.faq]; a[i] = { ...f, answer: e.target.value }; set({ faq: a }); }} rows={2} placeholder="trợ lý trả lời…" className="flex-1 rounded-lg border-2 border-emerald-200 p-2 text-sm" />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-sm">
              <label className="flex items-center gap-1.5 font-bold text-slate-600">
                <input type="checkbox" checked={!!f.is_active} onChange={(e) => { const a = [...d.faq]; a[i] = { ...f, is_active: e.target.checked ? 1 : 0 }; set({ faq: a }); }} /> Đang dùng
              </label>
              <button onClick={() => set({ faq: d.faq.filter((_, j) => j !== i) })} className="font-bold text-red-500">Xoá</button>
            </div>
          </div>
        ))}
        <AddBtn onClick={() => set({ faq: [...d.faq, { question: "", answer: "", is_active: 1 }] })} />
      </Section>

      {/* Chips */}
      <Section title="✨ Gợi ý câu hỏi" hint="Câu khách bấm nhanh thay vì gõ. Theo từng ngữ cảnh khách đang đứng.">
        {d.chips.map((c, i) => (
          <div key={i} className="mb-2 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:flex-row sm:items-center">
            <select value={c.context} onChange={(e) => { const a = [...d.chips]; a[i] = { ...c, context: e.target.value }; set({ chips: a }); }} className="rounded-lg border-2 border-emerald-200 p-2 text-sm sm:w-40">
              {Object.entries(CTX_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input value={c.label} onChange={(e) => { const a = [...d.chips]; a[i] = { ...c, label: e.target.value }; set({ chips: a }); }} placeholder="vd: Cửa hàng bán những gì?" className="flex-1 rounded-lg border-2 border-emerald-200 p-2 text-sm" />
            <button onClick={() => set({ chips: d.chips.filter((_, j) => j !== i) })} className="shrink-0 font-bold text-red-500">Xoá</button>
          </div>
        ))}
        <AddBtn onClick={() => set({ chips: [...d.chips, { context: "general", label: "" }] })} />
      </Section>

      {/* Synonyms */}
      <Section title="🔤 Cách gọi khác của khách" hint="Dạy trợ lý hiểu cách nói địa phương cho 3 câu hay gặp.">
        {d.synonyms.map((s, i) => (
          <div key={i} className="mb-2 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:flex-row sm:items-center">
            <select value={s.intent_group} onChange={(e) => { const a = [...d.synonyms]; a[i] = { ...s, intent_group: e.target.value }; set({ synonyms: a }); }} className="rounded-lg border-2 border-emerald-200 p-2 text-sm sm:w-40">
              {Object.entries(GROUP_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input value={s.term} onChange={(e) => { const a = [...d.synonyms]; a[i] = { ...s, term: e.target.value }; set({ synonyms: a }); }} placeholder="vd: hàng nào đắt khách" className="flex-1 rounded-lg border-2 border-emerald-200 p-2 text-sm" />
            <button onClick={() => set({ synonyms: d.synonyms.filter((_, j) => j !== i) })} className="shrink-0 font-bold text-red-500">Xoá</button>
          </div>
        ))}
        <AddBtn onClick={() => set({ synonyms: [...d.synonyms, { intent_group: "overview", term: "" }] })} />
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-3">
        <button onClick={save} disabled={saving} className="mx-auto block w-full max-w-2xl rounded-xl bg-brand py-3.5 text-lg font-extrabold text-white disabled:opacity-50">
          {saving ? "Đang lưu…" : "💾 Lưu tất cả"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="ml-1 font-extrabold text-brand-dark">{title}</h2>
      <p className="mb-2 ml-1 text-sm text-slate-500">{hint}</p>
      {children}
    </div>
  );
}

function AddBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full rounded-xl border-2 border-dashed border-emerald-300 py-2.5 font-bold text-brand-dark">
      ➕ Thêm dòng
    </button>
  );
}
