"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { BackBar, goBackSmart, Ok } from "./OwnerShared";

interface Row {
  item_code: string;
  display_name: string;
}
interface Dup {
  name: string;
  items: Row[];
}
interface Health {
  total: number;
  duplicates: Dup[];
  no_image: Row[];
  no_price: Row[];
  uncategorized: Row[];
  no_shelf: Row[];
}

export function DataHealth() {
  const router = useRouter();
  const [d, setD] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    frappeCall<Health>("cago.api.owner.data_health", {}, { method: "GET" })
      .then(setD)
      .finally(() => setLoading(false));
  }, []);

  const edit = (code: string) => router.push(`/pos/products/${encodeURIComponent(code)}/edit`);

  // A collapsible-free section: icon + title + count, then the rows (tap to fix). Severity colours
  // the badge so the owner sees what's most worth fixing first.
  const Section = ({ icon, title, rows, severity = "warn", hint }: { icon: string; title: string; rows: Row[]; severity?: "bad" | "warn" | "soft"; hint: string }) => {
    const tone = severity === "bad" ? "bg-red-100 text-red-700" : severity === "warn" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500";
    return (
      <div className="mb-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-lg font-extrabold">{icon} {title}</span>
          <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${rows.length ? tone : "bg-emerald-100 text-emerald-700"}`}>{rows.length}</span>
        </div>
        <div className="mb-1.5 text-sm text-slate-500">{hint}</div>
        {rows.length === 0 ? (
          <div className="rounded-xl bg-white p-3 text-center text-sm text-emerald-700">Không có — tốt 👍</div>
        ) : (
          <div className="xl:grid xl:grid-cols-2 xl:gap-x-3">
            {rows.map((r) => (
              <button key={r.item_code} onClick={() => edit(r.item_code)} className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl bg-white p-3 text-left shadow">
                <span className="min-w-0 truncate font-bold">{r.display_name}</span>
                <span className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-bold text-white">Sửa →</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[820px]">
      <BackBar onBack={() => goBackSmart(router)} title="🩺 KIỂM TRA DỮ LIỆU" />
      {loading ? (
        <SkeletonRows rows={6} thumb={false} />
      ) : !d ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tải được.</div>
      ) : (
        <>
          <div className="mb-3 rounded-xl bg-white p-3 text-center text-slate-600">
            Đang kiểm <b>{d.total}</b> mặt hàng. Bấm vào dòng để sửa ngay.
          </div>
          {d.duplicates.length === 0 && d.no_image.length === 0 && d.no_price.length === 0 && d.uncategorized.length === 0 && (
            <Ok>Dữ liệu sạch sẽ. 🎉</Ok>
          )}
          {/* Duplicates render specially (grouped). */}
          {d.duplicates.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-lg font-extrabold">👯 Có thể trùng tên</span>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-sm font-bold text-red-700">{d.duplicates.length}</span>
              </div>
              <div className="mb-1.5 text-sm text-slate-500">Các mặt hàng tên gần giống nhau — kiểm xem có bị nhập trùng không.</div>
              {d.duplicates.map((g, i) => (
                <div key={i} className="mb-2 rounded-xl bg-white p-3 shadow">
                  <div className="mb-1.5 text-sm font-bold text-slate-500">&quot;{g.name}&quot; — {g.items.length} mặt hàng</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {g.items.map((r) => (
                      <button key={r.item_code} onClick={() => edit(r.item_code)} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-left">
                        <span className="min-w-0 truncate font-bold">{r.display_name}</span>
                        <span className="shrink-0 text-xs font-bold text-amber-600">Sửa →</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Section icon="🏷" title="Thiếu giá bán" rows={d.no_price} severity="bad" hint="Hàng chưa có giá sẽ hiện 'Liên hệ' — khách/nhân viên không tra được giá." />
          <Section icon="🖼" title="Thiếu ảnh" rows={d.no_image} severity="warn" hint="Ảnh giúp khách & nhân viên nhận diện nhanh trên kiosk và màn bán." />
          <Section icon="🗂" title="Chưa phân loại" rows={d.uncategorized} severity="warn" hint="Hàng chưa thuộc nhóm nào sẽ khó tìm và không lên đúng sơ đồ." />
          <Section icon="📍" title="Chưa có vị trí kệ" rows={d.no_shelf} severity="soft" hint="Tuỳ chọn: ghi vị trí giúp nhân viên lấy hàng nhanh." />
        </>
      )}
    </div>
  );
}
