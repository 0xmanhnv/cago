"use client";

import { useEffect, useRef, useState } from "react";
import { frappeCall } from "@/lib/api";
import { BackBar } from "@/components/owner/OwnerShared";
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
  assigned_name?: string;
  creation: string;
  accepted_at?: string;
};

function ago(iso: string): string {
  const t = new Date(iso.replace(" ", "T")).getTime();
  if (!t) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  return `${Math.floor(m / 60)} giờ trước`;
}

// A soft chime (WebAudio — no asset needed) when a NEW request arrives at the counter screen.
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
    load();
    const t = setInterval(load, 3000); // near-realtime without a socket (robust on flaky rural wifi)
    return () => clearInterval(t);
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

  const pending = rows.filter((r) => r.status === "pending");
  const accepted = rows.filter((r) => r.status === "accepted");

  return (
    <div className="mx-auto max-w-2xl p-4">
      <BackBar title="🛎️ Khách cần hỗ trợ" />

      {rows.length === 0 && (
        <div className="mt-10 text-center text-slate-400">
          <div className="text-5xl">✅</div>
          <p className="mt-2 font-bold">Chưa có ai cần hỗ trợ.</p>
          <p className="text-sm">Màn này tự cập nhật khi có khách gọi.</p>
        </div>
      )}

      {pending.length > 0 && <h3 className="mt-4 text-sm font-extrabold text-red-600">ĐANG CHỜ ({pending.length})</h3>}
      <div className="mt-2 grid gap-2.5">
        {pending.map((r) => (
          <Card key={r.name} r={r} accent="border-red-300 bg-red-50">
            <button
              disabled={busy === r.name}
              onClick={() => act(r.name, "accept_request")}
              className="min-h-touch rounded-xl bg-brand px-5 font-extrabold text-white disabled:opacity-50"
            >
              Nhận xử lý
            </button>
          </Card>
        ))}
      </div>

      {accepted.length > 0 && <h3 className="mt-5 text-sm font-extrabold text-brand-dark">ĐANG XỬ LÝ ({accepted.length})</h3>}
      <div className="mt-2 grid gap-2.5">
        {accepted.map((r) => (
          <Card key={r.name} r={r} accent="border-emerald-200 bg-emerald-50">
            <div className="text-right">
              <div className="mb-1 text-xs text-slate-500">👤 {r.assigned_name}</div>
              <button
                disabled={busy === r.name}
                onClick={() => act(r.name, "resolve_request")}
                className="min-h-touch rounded-xl bg-emerald-600 px-5 font-extrabold text-white disabled:opacity-50"
              >
                Hoàn tất
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Card({ r, accent, children }: { r: Req; accent: string; children: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border-2 ${accent} p-3.5`}>
      <div className="min-w-0">
        <div className="text-lg font-extrabold text-slate-800">{r.reason}</div>
        <div className="text-sm text-slate-600">📍 {r.kiosk_label} · {ago(r.creation)}</div>
        {r.focus_item_name && (
          <div className="mt-0.5 truncate text-sm text-slate-700">
            🛒 {r.focus_item_name}
            {r.location_text ? <span className="text-slate-500"> — {r.location_text}</span> : null}
          </div>
        )}
        {r.question && <div className="mt-0.5 truncate text-sm text-amber-800">💬 {r.question}</div>}
        {r.note && <div className="mt-0.5 truncate text-sm text-slate-500">📝 {r.note}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
