"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar } from "./OwnerShared";

interface Q {
  question: string;
  flags_text: string;
  phone: string;
  when: string;
}

export function UnsafeQuestions() {
  const router = useRouter();
  const [rows, setRows] = useState<Q[] | null>(null);

  useEffect(() => {
    frappeCall<Q[]>("cago.api.reports.unsafe_questions", { days: 14 }, { method: "GET" })
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (!rows) return <div className="py-8 text-center text-slate-500">Đang tải...</div>;

  return (
    <div>
      <BackBar onBack={() => router.push("/pos")} title="⚠️ Câu hỏi cần lưu ý" label="Trang chủ" />
      <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Trợ lý đã <b>từ chối</b> trả lời các câu hỏi về liều lượng / pha trộn / cách ly (14 ngày gần đây).
        Bác nên tư vấn trực tiếp cho khách hoặc nhờ người có chuyên môn.
      </p>
      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-emerald-100 bg-white p-6 text-center text-slate-500">
          Chưa có câu hỏi nào cần lưu ý. 👍
        </div>
      ) : (
        rows.map((q, i) => (
          <div key={i} className="mb-2.5 rounded-2xl border border-amber-100 bg-white p-3.5 shadow-sm">
            <div className="font-medium text-[#1b2733]">“{q.question}”</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-bold text-amber-800">{q.flags_text}</span>
              <span className="text-slate-400">{q.when}</span>
              {q.phone && <span className="ml-auto font-bold text-brand-dark">📞 {q.phone}</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
