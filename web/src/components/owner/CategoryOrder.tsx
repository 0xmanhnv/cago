"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar, Ok, Warn } from "./OwnerShared";

interface Cat {
  category: string;
  icon: string;
  count: number;
}

export function CategoryOrder() {
  const router = useRouter();
  const [items, setItems] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);

  useEffect(() => {
    frappeCall<Cat[]>("cago.api.owner.list_categories", {}, { method: "GET" })
      .then((r) => setItems(r || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
    setMsg(null);
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await frappeCall("cago.api.owner.set_category_order", { categories: JSON.stringify(items.map((c) => c.category)) });
      setMsg(<Ok>✅ Đã lưu thứ tự. Mở lại kiosk để thấy.</Ok>);
    } catch {
      setMsg(<Warn>Lỗi: không lưu được thứ tự.</Warn>);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <BackBar onBack={() => router.push("/owner")} title="SẮP XẾP LOẠI HÀNG" />
      <p className="mb-3 ml-1 text-slate-500">
        Dùng ▲ ▼ để đưa loại hàng hay bán lên trên. Thứ tự này áp dụng cho kiosk khách xem.
      </p>

      {loading ? (
        <div className="py-8 text-center text-slate-500">Đang tải...</div>
      ) : items.length === 0 ? (
        <div className="mt-card p-6 text-center text-slate-400">Chưa có loại hàng nào.</div>
      ) : (
        <>
          <div className="mt-card divide-y divide-slate-100 p-2">
            {items.map((c, i) => (
              <div key={c.category} className="flex items-center gap-3 py-2.5">
                <span className="w-7 text-center text-lg font-extrabold text-slate-400">{i + 1}</span>
                <span className="text-2xl leading-none">{c.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[17px] font-bold text-brand-dark">{c.category}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{c.count}</span>
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Lên"
                  className="h-11 w-11 rounded-xl bg-brand-light text-xl font-extrabold text-brand-dark disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === items.length - 1}
                  aria-label="Xuống"
                  className="h-11 w-11 rounded-xl bg-brand-light text-xl font-extrabold text-brand-dark disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={save}
            disabled={busy}
            className="mt-4 min-h-touch w-full rounded-2xl bg-brand py-4 text-xl font-extrabold text-white shadow-soft disabled:opacity-50"
          >
            {busy ? "Đang lưu..." : "💾 Lưu thứ tự"}
          </button>
          {msg}
        </>
      )}
    </div>
  );
}
