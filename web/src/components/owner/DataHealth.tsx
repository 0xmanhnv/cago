"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { confirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { BackBar, goBackSmart, Ok } from "./Shared";
import { SectionTabs } from "@/components/pos/SectionTabs";

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

// Tabs ordered by how much each issue hurts the shop (most critical first). Default opens the first
// tab that actually HAS items, so the owner lands on real work, not an empty "all good" tab.
type Sev = "bad" | "warn" | "soft";
const TABS: { key: keyof Health | "duplicates"; icon: string; label: string; sev: Sev; hint: string }[] = [
  { key: "no_price", icon: "🏷", label: "Thiếu giá", sev: "bad", hint: "Hàng chưa có giá sẽ hiện 'Liên hệ' — khách/nhân viên không tra được giá." },
  { key: "duplicates", icon: "👯", label: "Trùng tên", sev: "bad", hint: "Các mặt hàng tên gần giống nhau — kiểm xem có bị nhập trùng không." },
  { key: "no_image", icon: "🖼", label: "Thiếu ảnh", sev: "warn", hint: "Ảnh giúp khách & nhân viên nhận diện nhanh trên kiosk và màn bán." },
  { key: "uncategorized", icon: "🗂", label: "Chưa phân loại", sev: "warn", hint: "Hàng chưa thuộc nhóm nào sẽ khó tìm và không lên đúng sơ đồ." },
  { key: "no_shelf", icon: "📍", label: "Vị trí kệ", sev: "soft", hint: "Tuỳ chọn: ghi vị trí giúp nhân viên lấy hàng nhanh." },
];

export function DataHealth() {
  const router = useRouter();
  const [d, setD] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mergeFor, setMergeFor] = useState<number | null>(null); // index of the duplicate group being merged
  const [active, setActive] = useState<string>("");

  const load = () =>
    frappeCall<Health>("cago.api.owner.data_health", {}, { method: "GET" }).then(setD).finally(() => setLoading(false));
  useEffect(() => {
    void load();
  }, []);

  // Defensive: `active` is "" until the effect picks a tab (it runs after the first render with
  // data), and an unknown key must not crash on `.length`.
  const rowsFor = (k: string): Row[] => {
    if (!d || k === "duplicates") return [];
    const v = d[k as keyof Health];
    return Array.isArray(v) ? (v as Row[]) : [];
  };
  const count = (k: string) => (!d ? 0 : k === "duplicates" ? d.duplicates.length : rowsFor(k).length);

  // Pick the default/auto tab: first (most important) tab with items; keep current if it still has
  // items (so after fixing/merging we don't jump away unexpectedly), else advance.
  useEffect(() => {
    if (!d) return;
    if (active && count(active) > 0) return;
    const firstWithItems = TABS.find((t) => count(t.key) > 0);
    setActive(firstWithItems ? firstWithItems.key : TABS[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  const edit = (code: string) => router.push(`/pos/products/${encodeURIComponent(code)}/edit`);

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

  const badgeTone = (sev: Sev, n: number) =>
    n === 0 ? "bg-emerald-100 text-emerald-700" : sev === "bad" ? "bg-red-100 text-red-700" : sev === "warn" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600";

  const rowsOf = rowsFor; // safe (guards unknown/empty active)

  const tab = d ? TABS.find((t) => t.key === active) : undefined;
  const allClean = d && TABS.every((t) => count(t.key) === 0);

  return (
    <div className="mx-auto max-w-[820px]">
      <BackBar onBack={() => goBackSmart(router)} title="🩺 Kiểm tra dữ liệu" />
      <SectionTabs group="products" />
      {loading ? (
        <SkeletonRows rows={6} thumb={false} />
      ) : !d ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tải được.</div>
      ) : (
        <>
          <div className="mb-3 rounded-xl bg-white p-3 text-center text-slate-600">
            Đang kiểm <b>{d.total}</b> mặt hàng. {allClean ? "" : "Chọn mục bên dưới để xử lý."}
          </div>

          {allClean ? (
            <Ok>Dữ liệu sạch sẽ. 🎉</Ok>
          ) : (
            <>
              {/* Tab bar — most important first; only one open at a time. Badge shows the count
                  (green ✓ when 0). */}
              <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
                {TABS.map((t) => {
                  const n = count(t.key);
                  const on = t.key === active;
                  return (
                    <button
                      key={t.key}
                      onClick={() => { setActive(t.key); setMergeFor(null); }}
                      className={`flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-bold ${on ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600"}`}
                    >
                      <span>{t.icon} {t.label}</span>
                      <span className={`rounded-full px-1.5 text-xs font-bold ${on ? "bg-white/25 text-white" : badgeTone(t.sev, n)}`}>{n === 0 ? "✓" : n}</span>
                    </button>
                  );
                })}
              </div>

              {tab && <div className="mb-1.5 text-sm text-slate-500">{tab.hint}</div>}

              {/* Active tab content */}
              {active === "duplicates" ? (
                count("duplicates") === 0 ? (
                  <div className="rounded-xl bg-white p-3 text-center text-sm text-emerald-700">Không có — tốt 👍</div>
                ) : (
                  d.duplicates.map((g, i) => (
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
                  ))
                )
              ) : rowsOf(active).length === 0 ? (
                <div className="rounded-xl bg-white p-3 text-center text-sm text-emerald-700">Không có — tốt 👍</div>
              ) : (
                <div className="xl:grid xl:grid-cols-2 xl:gap-x-3">
                  {rowsOf(active).map((r) => (
                    <button key={r.item_code} onClick={() => edit(r.item_code)} className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl bg-white p-3 text-left shadow">
                      <span className="min-w-0 truncate font-bold">{r.display_name}</span>
                      <span className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-bold text-white">Sửa →</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
