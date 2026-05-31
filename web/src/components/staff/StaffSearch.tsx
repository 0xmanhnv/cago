"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import type { ProductCard } from "@/lib/types";

export function StaffSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [list, setList] = useState<ProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const tRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const run = async (query: string) => {
    setLoading(true);
    try {
      const r = await frappeCall<ProductCard[]>("cago.api.staff.search_products", { query }, { method: "GET" });
      setList(r || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void run("");
  }, []);

  return (
    <div>
      <div className="mb-3.5 flex items-center gap-2.5">
        <button onClick={() => router.push("/staff")} className="rounded-xl bg-slate-200 px-4 py-3 text-lg font-bold">
          ← Trang chủ
        </button>
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            clearTimeout(tRef.current);
            tRef.current = setTimeout(() => run(e.target.value.trim()), 250);
          }}
          placeholder="Tên, tên hay gọi, màu, công dụng..."
          className="flex-1 rounded-xl border-2 border-slate-300 p-3.5 text-lg"
        />
      </div>
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : list.length === 0 ? (
        <div className="text-slate-500">Không tìm thấy.</div>
      ) : (
        list.map((p) => (
          <button
            key={p.item_code}
            onClick={() => router.push(`/staff/products/${encodeURIComponent(p.item_code)}`)}
            className="mb-3 flex w-full gap-3 rounded-xl bg-white p-3.5 text-left shadow"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.image && <img src={p.image} alt="" className="h-[76px] w-[76px] rounded-lg object-cover" />}
            <div>
              <div className="font-bold">{p.display_name}</div>
              <div className="font-bold text-brand">{p.price_text}</div>
              <div className="text-slate-500">
                {p.stock_status} {p.category ? `· ${p.category}` : ""}
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  );
}
