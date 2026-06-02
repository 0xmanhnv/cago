"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";

type Req = { request_id: string; phone_masked: string; customer_name?: string | null };

export function StaffVerify() {
  const router = useRouter();
  const [list, setList] = useState<Req[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      setList(await frappeCall<Req[]>("cago.api.verify.pending", {}, { method: "GET" }));
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    void load();
    const t = setInterval(load, 4000); // refresh pending requests
    return () => clearInterval(t);
  }, []);

  const approve = async (id: string) => {
    setMsg("");
    try {
      await frappeCall("cago.api.verify.approve", { request_id: id });
      setMsg("✅ Đã xác nhận — khách xem được nợ của mình.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Lỗi xác nhận.");
    }
    void load();
  };

  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2.5">
        <button onClick={() => router.push("/pos")} className="shrink-0 whitespace-nowrap rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ‹ Trang chủ
        </button>
        <div className="flex-1 text-xl font-bold">Xác nhận khách xem nợ</div>
      </div>
      {msg && <div className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-800">{msg}</div>}
      {list.length === 0 ? (
        <div className="text-slate-500">Chưa có khách nào yêu cầu. (Khi khách nhập SĐT ở kiosk, yêu cầu sẽ hiện ở đây.)</div>
      ) : (
        list.map((r) => (
          <div key={r.request_id} className="mb-2 flex items-center justify-between rounded-xl bg-white p-3.5 shadow">
            <div>
              <div className="font-bold">{r.customer_name || "Khách (chưa rõ tên)"}</div>
              <div className="text-slate-500">SĐT: {r.phone_masked}</div>
            </div>
            <button
              onClick={() => approve(r.request_id)}
              disabled={!r.customer_name}
              className="min-h-[48px] rounded-xl bg-brand px-4 font-bold text-white disabled:opacity-40"
            >
              {r.customer_name ? "✅ Xác nhận" : "Không có hồ sơ"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
