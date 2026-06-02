"use client";

// "Đơn chờ đồng bộ" — the offline sale queue. Staff see what's still waiting to reach the server,
// can force a sync, reprint a provisional receipt, or retry a sale the server rejected.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { useOnline } from "@/lib/offline/useOnline";
import { type QueuedSale } from "@/lib/offline/db";
import { listQueue, purgeDone, retrySale } from "@/lib/offline/queue";
import { flushQueue } from "@/lib/offline/sync";
import { toast } from "@/components/ui/toast";

const esc = (s: string) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

// Self-contained provisional print (the pending list isn't inside the sell screen). 58mm default.
function printProvisional(store: string, sale: QueuedSale) {
  const w = window.open("", "_blank", "width=380,height=640");
  const rows = sale.display.lines
    .map((l) => `<div class="it"><div>${esc(l.name)}</div><div class="r">${l.qty} ${esc(l.uom)} x ${l.rate_text} = <b>${l.amount_text}</b></div></div>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(sale.local_code)}</title>
  <style>@page{size:58mm auto;margin:2mm}body{width:54mm;font-family:monospace;font-size:11px;color:#000}
  h3{text-align:center;margin:2px 0}.c{text-align:center}.it{border-bottom:1px dashed #999;padding:2px 0}.r{font-size:10px}
  .tot{font-weight:bold;font-size:14px;text-align:right;margin-top:4px}.tmp{text-align:center;border:1px dashed #000;margin:3px 0;padding:2px;font-weight:bold}</style>
  </head><body>
  <h3>${esc(store)}</h3>
  <div class="c">PHIẾU BÁN HÀNG (TẠM)</div>
  <div class="tmp">⚠ CHƯA ĐỒNG BỘ — ${esc(sale.local_code)}</div>
  <hr>${rows}
  <div class="tot">TỔNG: ${esc(sale.display.total_text)}</div>
  <div class="c" style="margin-top:6px">Cảm ơn quý khách!</div>
  <script>window.onload=function(){window.print()}</script>
  </body></html>`;
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

const STATUS: Record<QueuedSale["status"], { label: string; cls: string }> = {
  pending: { label: "Chờ đồng bộ", cls: "bg-amber-100 text-amber-800" },
  syncing: { label: "Đang gửi…", cls: "bg-sky-100 text-sky-800" },
  done: { label: "Đã đồng bộ", cls: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Lỗi — cần xử lý", cls: "bg-rose-100 text-rose-800" },
};

export function PendingSales() {
  const router = useRouter();
  const { boot } = useSession();
  const online = useOnline();
  const [rows, setRows] = useState<QueuedSale[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    listQueue().then(setRows).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    refresh();
    const on = () => refresh();
    window.addEventListener("cago:queuechange", on);
    return () => window.removeEventListener("cago:queuechange", on);
  }, [refresh]);

  const sync = async () => {
    if (!online) {
      toast.error("Chưa có mạng. Khi có mạng đơn sẽ tự đồng bộ.");
      return;
    }
    setSyncing(true);
    try {
      const n = await flushQueue();
      toast.success(n > 0 ? `Đã đồng bộ ${n} đơn.` : "Không có đơn nào cần đồng bộ.");
    } finally {
      setSyncing(false);
      refresh();
    }
  };

  const retry = async (id: string) => {
    await retrySale(id);
    refresh();
    void sync();
  };

  const clearDone = async () => {
    await purgeDone();
    refresh();
  };

  const pending = rows.filter((r) => r.status === "pending" || r.status === "syncing");
  const failed = rows.filter((r) => r.status === "failed");
  const done = rows.filter((r) => r.status === "done");

  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5">
        <button onClick={() => router.push("/pos")} className="rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ‹ Trang chủ
        </button>
        <div className="min-w-0 flex-1 text-2xl font-bold">Đơn chờ đồng bộ</div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${online ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
          {online ? "● Trực tuyến" : "● Ngoại tuyến"}
        </span>
      </div>

      <button
        onClick={sync}
        disabled={syncing || !online || pending.length === 0}
        className="mb-4 w-full rounded-2xl bg-brand py-3.5 text-lg font-extrabold text-white disabled:opacity-40"
      >
        {syncing ? "Đang đồng bộ…" : pending.length > 0 ? `Đồng bộ ${pending.length} đơn ngay` : "Không có đơn chờ"}
      </button>

      {rows.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow">Chưa có đơn nào trong hàng đợi.</div>
      )}

      {failed.length > 0 && (
        <Section title={`⚠ ${failed.length} đơn lỗi (cần xử lý)`}>
          {failed.map((s) => (
            <Card key={s.client_uuid} sale={s} store={boot?.brand || "Cửa hàng"} onPrint={printProvisional} onRetry={() => retry(s.client_uuid)} />
          ))}
        </Section>
      )}

      {pending.length > 0 && (
        <Section title={`${pending.length} đơn chờ`}>
          {pending.map((s) => (
            <Card key={s.client_uuid} sale={s} store={boot?.brand || "Cửa hàng"} onPrint={printProvisional} />
          ))}
        </Section>
      )}

      {done.length > 0 && (
        <Section title={`${done.length} đơn đã đồng bộ`}>
          {done.map((s) => (
            <Card key={s.client_uuid} sale={s} store={boot?.brand || "Cửa hàng"} onPrint={printProvisional} />
          ))}
          <button onClick={clearDone} className="mt-1 w-full rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-500">
            Xoá các đơn đã đồng bộ khỏi danh sách
          </button>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-sm font-bold text-slate-500">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Card({
  sale,
  store,
  onPrint,
  onRetry,
}: {
  sale: QueuedSale;
  store: string;
  onPrint: (store: string, s: QueuedSale) => void;
  onRetry?: () => void;
}) {
  const st = STATUS[sale.status];
  return (
    <div className="rounded-xl bg-white p-3 shadow">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold">
            {sale.local_code}
            {sale.invoice && <span className="ml-1 text-sm font-normal text-emerald-600">→ {sale.invoice}</span>}
          </div>
          <div className="truncate text-sm text-slate-500">
            {sale.display.customer_name || "Khách lẻ"} · {sale.display.item_count} mặt hàng · {sale.posted_at.slice(5, 16)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-extrabold text-brand">{sale.display.total_text}</div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.label}</span>
        </div>
      </div>
      {sale.error && <div className="mt-1 text-sm text-rose-600">{sale.error}</div>}
      <div className="mt-2 flex gap-2">
        <button onClick={() => onPrint(store, sale)} className="rounded-lg bg-slate-200 px-3 py-1.5 text-sm font-bold text-slate-700">
          🖨 In phiếu tạm
        </button>
        {onRetry && (
          <button onClick={onRetry} className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-bold text-white">
            ↻ Thử lại
          </button>
        )}
      </div>
    </div>
  );
}
