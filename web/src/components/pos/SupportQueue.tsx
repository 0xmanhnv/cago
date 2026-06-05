"use client";

import { useEffect, useRef, useState } from "react";
import { frappeCall } from "@/lib/api";
import { BackBar } from "@/components/owner/Shared";
import { confirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

type Req = {
  name: string;
  status: string;
  reason: string;
  kiosk_label: string;
  focus_item_name?: string;
  location_text?: string;
  question?: string;
  note?: string;
  customer_name?: string;
  customer_phone?: string;
  assigned_name?: string;
  creation: string;
  accepted_at?: string;
};

const URGENT_MIN = 3; // a pending request waiting longer than this is highlighted

function parseTs(iso: string) {
  return new Date(iso.replace(" ", "T")).getTime();
}
function minsAgo(iso: string) {
  const t = parseTs(iso);
  return t ? Math.floor((Date.now() - t) / 60000) : 0;
}
function ago(iso: string) {
  const m = minsAgo(iso);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  return `${Math.floor(m / 60)} giờ trước`;
}
function clock(iso: string) {
  const t = parseTs(iso);
  if (!t) return "";
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

// Soft chime (WebAudio — no asset) when a NEW request arrives while the queue is open.
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new Ctx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.6);
    o.start();
    o.stop(ac.currentTime + 0.65);
  } catch {
    /* audio not allowed — silent is fine */
  }
}

export function SupportQueue() {
  const [rows, setRows] = useState<Req[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [, force] = useState(0); // re-render every 30s so "đã chờ N phút" / urgency stay fresh
  const prevPending = useRef<number | null>(null);

  const load = async () => {
    try {
      const r = await frappeCall<Req[]>("cago.api.support.list_requests", {});
      setRows(r);
      const pending = r.filter((x) => x.status === "pending").length;
      if (prevPending.current !== null && pending > prevPending.current) chime();
      prevPending.current = pending;
    } catch {
      /* keep last list; retry next tick */
    }
  };

  useEffect(() => {
    // Opening the queue = "read" → clears the new-call badge until the next call.
    frappeCall("cago.api.support.mark_seen", {}).catch(() => {});
    load();
    const t = setInterval(load, 3000); // near-realtime without a socket (robust on flaky rural wifi)
    const tick = setInterval(() => force((n) => n + 1), 30000);
    return () => {
      clearInterval(t);
      clearInterval(tick);
    };
  }, []);

  const act = async (name: string, method: "accept_request" | "resolve_request") => {
    setBusy(name);
    try {
      await frappeCall(`cago.api.support.${method}`, { name });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi cập nhật.");
    } finally {
      setBusy("");
    }
  };

  const resolveAll = async () => {
    const open = rows.filter((r) => r.status === "pending" || r.status === "accepted").length;
    if (!open) return;
    if (!(await confirmDialog(`Đánh dấu đã xử lý xong tất cả ${open} yêu cầu? (chỉ dùng khi đã giúp xong khách)`, { danger: true, confirmLabel: "Xong hết" }))) return;
    setBusy("all");
    try {
      const r = await frappeCall<{ resolved: number }>("cago.api.support.resolve_all", {});
      toast.success(`Đã đóng ${r.resolved} yêu cầu.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi.");
    } finally {
      setBusy("");
    }
  };

  const pending = rows.filter((r) => r.status === "pending");
  const accepted = rows.filter((r) => r.status === "accepted");
  const openCount = pending.length + accepted.length;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <BackBar title="🛎️ Khách cần hỗ trợ" />

      {openCount > 1 && (
        <button onClick={resolveAll} disabled={busy === "all"} className="mb-3 w-full rounded-xl border-2 border-emerald-300 py-2.5 font-bold text-brand-dark disabled:opacity-50">
          ✅ Xong hết ({openCount})
        </button>
      )}

      {rows.length === 0 && (
        <div className="mt-10 text-center text-slate-400">
          <div className="text-5xl">✅</div>
          <p className="mt-2 font-bold">Chưa có ai cần hỗ trợ.</p>
          <p className="text-sm">Màn này tự cập nhật khi có khách gọi.</p>
        </div>
      )}

      {pending.length > 0 && <h3 className="mt-4 text-sm font-extrabold text-red-600">ĐANG CHỜ ({pending.length})</h3>}
      <div className="mt-2 grid gap-2.5">
        {pending.map((r) => {
          const urgent = minsAgo(r.creation) >= URGENT_MIN;
          return (
            <Card key={r.name} r={r} accent={urgent ? "border-red-500 bg-red-100" : "border-red-200 bg-red-50"} urgent={urgent}>
              <div className="flex flex-col gap-1.5">
                <button disabled={busy === r.name} onClick={() => act(r.name, "accept_request")} className="min-h-touch rounded-xl bg-brand px-4 font-extrabold text-white disabled:opacity-50">
                  Nhận xử lý
                </button>
                <button disabled={busy === r.name} onClick={() => act(r.name, "resolve_request")} className="rounded-xl border border-slate-300 px-4 py-1.5 text-sm font-bold text-slate-500 disabled:opacity-50">
                  ✓ Xong luôn
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {accepted.length > 0 && <h3 className="mt-5 text-sm font-extrabold text-brand-dark">ĐANG XỬ LÝ ({accepted.length})</h3>}
      <div className="mt-2 grid gap-2.5">
        {accepted.map((r) => (
          <Card key={r.name} r={r} accent="border-emerald-200 bg-emerald-50">
            <div className="text-right">
              <div className="mb-1 text-xs text-slate-500">👤 {r.assigned_name}</div>
              <button disabled={busy === r.name} onClick={() => act(r.name, "resolve_request")} className="min-h-touch rounded-xl bg-emerald-600 px-5 font-extrabold text-white disabled:opacity-50">
                Hoàn tất
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Card({ r, accent, urgent, children }: { r: Req; accent: string; urgent?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-start justify-between gap-3 rounded-2xl border-2 ${accent} p-3.5`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 text-lg font-extrabold text-slate-800">
          {r.reason}
          {urgent && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">đã chờ {minsAgo(r.creation)}′</span>}
        </div>
        {/* WHO */}
        <div className="text-sm text-slate-700">
          👤 {r.customer_name || "Khách"}
          {r.customer_phone && <a href={`tel:${r.customer_phone}`} className="ml-1 font-bold text-brand">📞 {r.customer_phone}</a>}
        </div>
        {/* WHERE + WHEN */}
        <div className="text-sm text-slate-600">📍 {r.kiosk_label} · 🕒 {clock(r.creation)} ({ago(r.creation)})</div>
        {r.focus_item_name && (
          <div className="mt-0.5 truncate text-sm text-slate-700">
            🛒 {r.focus_item_name}
            {r.location_text ? <span className="text-slate-500"> — {r.location_text}</span> : null}
          </div>
        )}
        {r.question && <div className="mt-0.5 text-sm text-amber-800">💬 {r.question}</div>}
        {r.note && <div className="mt-0.5 text-sm text-slate-600">📝 {r.note}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
