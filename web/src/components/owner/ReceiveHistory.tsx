"use client";

import { uomLabel } from "@/lib/uom";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { DateHeader, groupOrdered } from "@/components/ui/ListUI";
import { BackBar, goBackSmart } from "./OwnerShared";

import { PageLoading } from "@/components/ui/Loading";
interface Line {
  name: string;
  qty: number;
  uom: string;
  amount_text: string;
}
interface Receipt {
  entry: string;
  date: string;
  time: string;
  invoiced: boolean;
  image: string | null;
  total_text: string;
  lines: Line[];
  count: number;
}

const PAGE = 30;

// Friendly group header: Hôm nay / Hôm qua / dd/MM/yyyy (instead of raw "2026-06-04").
function dateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diff === 0) return "Hôm nay";
  if (diff === 1) return "Hôm qua";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function ReceiveHistory() {
  const router = useRouter();
  const [rows, setRows] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null); // expanded receipt
  const [zoom, setZoom] = useState<string | null>(null); // full-screen invoice image

  const load = async () => {
    setLoading(true);
    try {
      const r = (await frappeCall<Receipt[]>("cago.api.purchasing.receive_history", { start: 0, limit: PAGE }, { method: "GET" })) || [];
      setRows(r);
      setHasMore(r.length >= PAGE);
    } finally {
      setLoading(false);
    }
  };
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const r = (await frappeCall<Receipt[]>("cago.api.purchasing.receive_history", { start: rows.length, limit: PAGE }, { method: "GET" })) || [];
      setRows((p) => [...p, ...r]);
      setHasMore(r.length >= PAGE);
    } finally {
      setLoadingMore(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="LỊCH SỬ NHẬP HÀNG" />

      {loading ? (
        <PageLoading />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-slate-400">Chưa có phiếu nhập nào.</div>
      ) : (
        <>
          {groupOrdered(rows, (r) => dateLabel(r.date)).map((g) => (
            <div key={g.label}>
              <DateHeader label={g.label} />
              {g.items.map((r) => {
                const first = r.lines[0];
                return (
                <div key={r.entry} className="mb-2.5 rounded-xl bg-white p-3 shadow-sm">
                  <button onClick={() => setOpen(open === r.entry ? null : r.entry)} className="flex w-full items-center gap-3 text-left">
                    {r.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image} alt="hoá đơn" onClick={(e) => { e.stopPropagation(); setZoom(r.image); }} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl">📦</span>
                    )}
                    <div className="min-w-0 flex-1">
                      {/* Lead with WHAT was received so each card is identifiable without expanding.
                          Single item → name+qty; bulk receive → "📦 N mặt hàng" + a name preview. */}
                      {r.count > 1 ? (
                        <>
                          <div className="font-bold text-slate-800">📦 Nhập {r.count} mặt hàng</div>
                          <div className="truncate text-xs text-slate-400">{r.lines.map((l) => l.name).join(", ")}</div>
                        </>
                      ) : (
                        <div className="truncate font-bold text-slate-800">
                          {first ? `${first.name} · ${first.qty} ${uomLabel(first.uom)}` : "Phiếu nhập"}
                        </div>
                      )}
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-slate-400">🕒 {r.time}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.invoiced ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"}`}>
                          {r.invoiced ? "🧾 Có HĐ" : "Không HĐ"}
                        </span>
                        {r.total_text && <span className="font-bold text-brand">{r.total_text}</span>}
                      </div>
                    </div>
                    <span className="text-2xl text-slate-300">{open === r.entry ? "▴" : "▾"}</span>
                  </button>
                  {open === r.entry && (
                    <div className="mt-2 border-t border-slate-100 pt-2">
                      {r.lines.map((l, i) => (
                        <div key={i} className="flex justify-between gap-2 py-1 text-sm">
                          <span>
                            <b>{l.name}</b> <span className="text-slate-500">· {l.qty} {uomLabel(l.uom)}</span>
                          </span>
                          <b className="text-slate-700">{l.amount_text}</b>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          ))}
          {hasMore && (
            <button onClick={loadMore} disabled={loadingMore} className="mt-2 w-full rounded-xl bg-slate-200 py-3 font-bold text-slate-700 disabled:opacity-50">
              {loadingMore ? "Đang tải..." : "Xem thêm"}
            </button>
          )}
        </>
      )}

      {zoom && (
        <div className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="hoá đơn" className="animate-pop-in max-h-[90vh] max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
