"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";

const STATUS_VI: Record<string, string> = {
  New: "Mới",
  Processing: "Đang xử lý",
  Completed: "Hoàn tất",
  Expired: "Hết hạn",
};

interface WantedItem {
  display_name: string;
  qty: number;
  shelf_location?: string;
  price_text: string;
}
interface WantedList {
  code: string;
  status: string;
  is_expired?: boolean;
  note?: string;
  items: WantedItem[];
}

export function StaffWanted() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [wl, setWl] = useState<WantedList | null>(null);
  const [msg, setMsg] = useState("");

  const lookup = async () => {
    if (!code.trim()) return;
    setMsg("");
    setWl(null);
    try {
      const r = await frappeCall<WantedList>("cago.api.staff.get_wanted_list", { code: code.trim() }, { method: "GET" });
      setWl(r);
    } catch {
      setMsg("Không tìm thấy đơn với mã này.");
    }
  };
  const setStatus = async (status: string) => {
    if (!wl) return;
    const r = await frappeCall<{ status: string }>("cago.api.staff.set_wanted_list_status", { code: wl.code, status });
    setWl({ ...wl, status: r.status });
  };

  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2.5">
        <button onClick={() => router.push("/staff")} className="rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ← Trang chủ
        </button>
      </div>
      <input
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && lookup()}
        placeholder="VD: WL-2026-00001"
        className="mb-2.5 w-full rounded-xl border-2 border-slate-300 p-3.5 text-lg"
      />
      <button onClick={lookup} className="min-h-touch w-full rounded-2xl bg-teal-600 py-3 text-lg font-bold text-white">
        Tìm đơn
      </button>
      {msg && <div className="mt-3 rounded-lg border border-amber-400 bg-amber-100 p-3 text-amber-900">{msg}</div>}
      {wl && (
        <div className="mt-3.5 rounded-xl bg-white p-4">
          <h3 className="text-lg font-bold">
            Đơn {wl.code}{" "}
            <span className="ml-1 inline-block rounded-full bg-slate-200 px-2.5 py-1 text-sm">
              {STATUS_VI[wl.status] || wl.status}
            </span>
          </h3>
          {wl.is_expired && (
            <div className="my-2 rounded-lg border border-amber-400 bg-amber-100 p-3 text-amber-900">
              ⏰ Đơn đã quá hạn (&gt;2 ngày), nên xác nhận lại với khách.
            </div>
          )}
          {wl.note && <div className="text-slate-500">{wl.note}</div>}
          {wl.items.map((i, idx) => (
            <div key={idx} className="flex justify-between gap-3 border-b border-slate-100 py-2">
              <span>
                <b>{i.display_name}</b>
                <br />
                <span className="text-slate-500">
                  SL: {i.qty} {i.shelf_location ? `· ${i.shelf_location}` : ""}
                </span>
              </span>
              <b>{i.price_text}</b>
            </div>
          ))}
          <div className="mt-3 flex gap-2.5">
            <button onClick={() => setStatus("Processing")} className="min-h-[48px] flex-1 rounded-xl bg-blue-600 font-bold text-white">
              ⏳ Đang xử lý
            </button>
            <button onClick={() => setStatus("Completed")} className="min-h-[48px] flex-1 rounded-xl bg-brand font-bold text-white">
              ✅ Hoàn tất
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
