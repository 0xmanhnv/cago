"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar, goBackSmart, DraftModal } from "./OwnerShared";

interface Suggest {
  item_code: string;
  display_name: string;
  on_hand_text: string;
  suggest_qty: number;
  uom: string;
  shelf_location?: string;
  supplier_name: string;
}

export function Reorder() {
  const router = useRouter();
  const [rows, setRows] = useState<Suggest[] | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    frappeCall<Suggest[]>("cago.api.purchasing.reorder_suggestions", {}, { method: "GET" })
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (!rows) return <div className="py-8 text-center text-slate-500">Đang tải...</div>;

  // Group by usual supplier so the owner can build one purchase per NCC.
  const groups: Record<string, Suggest[]> = {};
  for (const r of rows) (groups[r.supplier_name] ||= []).push(r);

  const buildList = (supplier: string, items: Suggest[]) => {
    const lines = [`ĐƠN NHẬP HÀNG — ${supplier}`, "—".repeat(12)];
    for (const it of items) lines.push(`• ${it.display_name}: ${it.suggest_qty ? `${it.suggest_qty}` : "?"} ${it.uom} (còn ${it.on_hand_text})`);
    setDraft(lines.join("\n"));
  };

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="🛒 Gợi ý nhập hàng" />
      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-emerald-100 bg-white p-6 text-center text-slate-500">
          Hiện chưa có mặt hàng nào dưới mức đặt lại. 👍
        </div>
      ) : (
        Object.entries(groups).map(([supplier, items]) => (
          <div key={supplier} className="mb-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-extrabold text-brand-dark">🚚 {supplier}</div>
              <button onClick={() => buildList(supplier, items)} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-bold text-white">
                📋 Tạo đơn nhập
              </button>
            </div>
            {items.map((it) => (
              <div key={it.item_code} className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
                <div>
                  <div className="font-bold">{it.display_name}</div>
                  <div className="text-sm text-slate-500">
                    Còn {it.on_hand_text}
                    {it.shelf_location ? ` · kệ ${it.shelf_location}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">nên nhập</div>
                  <b className="text-teal-700">
                    {it.suggest_qty ? `${it.suggest_qty} ${it.uom}` : "—"}
                  </b>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
      {draft !== null && <DraftModal text={draft} title="🛒 Đơn nhập hàng" allowPrint onClose={() => setDraft(null)} />}
    </div>
  );
}
