"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
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
  const [busy, setBusy] = useState(false);
  const [mergeFor, setMergeFor] = useState<number | null>(null); // index of the group being merged

  const load = () =>
    frappeCall<Health>("cago.api.owner.data_health", {}, { method: "GET" }).then(setD).finally(() => setLoading(false));
  useEffect(() => {
    void load();
  }, []);

  const edit = (code: string) => router.push(`/pos/products/${encodeURIComponent(code)}/edit`);

  // "Không trùng": remember this group so it stops showing.
  const dismiss = async (items: Row[]) => {
    if (busy) return;
    if (!(await confirmDialog("Đánh dấu nhóm này KHÔNG trùng nhau? Sẽ không hiện lại nữa."))) return;
    setBusy(true);
    try {
      await frappeCall("cago.api.owner.dismiss_duplicate", { item_codes: JSON.stringify(items.map((r) => r.item_code)) });
      toast.success("Đã ghi nhận — không hiện lại nhóm này.");
      setMergeFor(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi.");
    } finally {
      setBusy(false);
    }
  };

  // "Gộp": keep `target`, absorb every other item in the group into it (irreversible).
  const merge = async (group: Row[], target: Row) => {
    if (busy) return;
    const others = group.filter((r) => r.item_code !== target.item_code);
    if (!(await confirmDialog(`Gộp ${others.length} mặt hàng vào "${target.display_name}" (${target.item_code})? Tồn/giá/lịch sử dồn về mặt này; các mặt kia bị xoá. KHÔNG hoàn tác được.`, { danger: true, confirmLabel: "Gộp" }))) return;
    setBusy(true);
    try {
      for (const src of others) {
        await frappeCall("cago.api.owner.merge_products", { source: src.item_code, target: target.item_code });
      }
      toast.success("Đã gộp xong.");
      setMergeFor(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không gộp được.");
      await load();
    } finally {
      setBusy(false);
    }
  };

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
                        <span className="min-w-0">
                          <span className="block truncate font-bold">{r.display_name}</span>
                          <span className="block truncate text-xs text-slate-400">{r.item_code}</span>
                        </span>
                        <span className="shrink-0 text-xs font-bold text-amber-600">Sửa →</span>
                      </button>
                    ))}
                  </div>
                  {/* Owner decides: merge (keep one), or mark "not a duplicate" (never show again). */}
                  {mergeFor === i ? (
                    <div className="mt-2 rounded-lg bg-amber-50 p-2">
                      <div className="mb-1.5 text-sm font-bold text-amber-800">Giữ lại mặt nào? (các mặt còn lại gộp vào đây)</div>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {g.items.map((r) => (
                          <button key={r.item_code} disabled={busy} onClick={() => merge(g.items, r)} className="rounded-lg bg-brand px-3 py-2 text-left text-sm font-bold text-white disabled:opacity-50">
                            Giữ: {r.display_name}
                            <span className="block text-xs font-normal text-white/80">{r.item_code}</span>
                          </button>
                        ))}
                      </div>
                      <button disabled={busy} onClick={() => setMergeFor(null)} className="mt-1.5 text-sm font-bold text-slate-500">Huỷ</button>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <button disabled={busy} onClick={() => setMergeFor(i)} className="flex-1 rounded-lg bg-rose-600 py-2 text-sm font-bold text-white disabled:opacity-50">🔀 Gộp lại</button>
                      <button disabled={busy} onClick={() => dismiss(g.items)} className="flex-1 rounded-lg border-2 border-slate-300 bg-white py-2 text-sm font-bold text-slate-600 disabled:opacity-50">Không trùng</button>
                    </div>
                  )}
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
