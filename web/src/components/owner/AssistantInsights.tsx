"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar, goBackSmart } from "./OwnerShared";
import { PageLoading } from "@/components/ui/Loading";

interface Insights {
  total: number;
  top: { q: string; count: number }[];
  gaps: { q: string; count: number; safety: boolean }[];
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
                      <button onClick={() => router.push("/pos/products")} className="rounded-full bg-brand-light px-2.5 py-0.5 font-bold text-brand-dark">➕ Bổ sung dữ liệu</button>
                    )}
                  </div>
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
                <div key={i} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-sm">
                  <span className="font-medium text-[#1b2733]">“{t.q}”</span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-bold text-slate-500">{t.count}×</span>
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
