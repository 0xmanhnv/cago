"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar, goBackSmart } from "./OwnerShared";
import { confirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { ICONS } from "@/lib/storemap";

import { PageLoading } from "@/components/ui/Loading";
interface Cat {
  category: string;
  icon: string;
  color: string;
  count: number;
  parent: string | null; // nhóm cha this leaf sits under (null = directly under the root)
}
interface Parent {
  name: string;
  icon: string;
}

// Pastel swatches matching the kiosk category look.
const COLORS = ["#e6f4ea", "#fde8e8", "#fef3c7", "#e0f2fe", "#ede9fe", "#fce7f3", "#f3f4f6"];
const blank = { old_name: "", name: "", icon: "📦", color: COLORS[0], parent: "", is_group: false };
const NO_PARENT = "Chưa xếp nhóm cha";

// Re-order the flat (sort-order) list so children sit together under their parent: parents appear
// in first-seen order, then the unparented ones last — so the screen reads as a tree and "Lưu thứ
// tự" persists that grouped order.
function groupByParent(list: Cat[]): Cat[] {
  const order: string[] = [];
  const buckets = new Map<string, Cat[]>();
  for (const c of list) {
    const key = c.parent || NO_PARENT;
    if (!buckets.has(key)) { buckets.set(key, []); if (key !== NO_PARENT) order.push(key); }
    buckets.get(key)!.push(c);
  }
  const keys = [...order, ...(buckets.has(NO_PARENT) ? [NO_PARENT] : [])];
  return keys.flatMap((k) => buckets.get(k)!);
}

export function CategoryOrder() {
  const router = useRouter();
  const [items, setItems] = useState<Cat[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<typeof blank | null>(null); // null = closed; old_name="" = adding

  const load = () => {
    setLoading(true);
    Promise.all([
      frappeCall<Cat[]>("cago.api.owner.list_categories", {}, { method: "GET" }).catch(() => [] as Cat[]),
      frappeCall<Parent[]>("cago.api.owner.list_category_parents", {}, { method: "GET" }).catch(() => [] as Parent[]),
    ])
      .then(([cats, pars]) => { setItems(groupByParent(cats || [])); setParents(pars || []); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const parentIcon = (name: string) => parents.find((p) => p.name === name)?.icon || "📁";

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  const moveParent = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= parents.length) return;
    const next = [...parents];
    [next[i], next[j]] = [next[j], next[i]];
    setParents(next);
  };

  const saveOrder = async () => {
    setBusy(true);
    try {
      // Persist BOTH orders: parent groups, then the leaves (each gets its own 1..N — the kiosk
      // orders top-level nhóm cha by one and the children within a parent by the other).
      if (parents.length) await frappeCall("cago.api.owner.set_category_order", { categories: JSON.stringify(parents.map((p) => p.name)) });
      await frappeCall("cago.api.owner.set_category_order", { categories: JSON.stringify(items.map((c) => c.category)) });
      toast.success("Đã lưu thứ tự.");
    } catch {
      toast.error("Lỗi: không lưu được thứ tự.");
    } finally {
      setBusy(false);
    }
  };

  const saveCategory = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      toast.error("Nhập tên loại hàng.");
      return;
    }
    setBusy(true);
    try {
      await frappeCall("cago.api.owner.save_category", {
        name: form.name.trim(),
        icon: form.icon,
        color: form.color,
        old_name: form.old_name || undefined,
        // A nhóm cha sits under the root (no parent picker); a leaf nests under the chosen parent.
        parent: form.is_group ? "" : form.parent,
        is_group: form.is_group ? 1 : 0,
      });
      toast.success(form.old_name ? "Đã cập nhật." : form.is_group ? "Đã thêm nhóm cha." : "Đã thêm loại hàng.");
      setForm(null);
      load();
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : "không lưu được."}`);
    } finally {
      setBusy(false);
    }
  };

  const removeName = async (name: string, kind: string) => {
    if (!(await confirmDialog(`Xoá ${kind} "${name}"?`, { danger: true, confirmLabel: "Xoá" }))) return;
    try {
      await frappeCall("cago.api.owner.delete_category", { name });
      toast.success("Đã xoá.");
      load();
    } catch (e) {
      toast.error(`${e instanceof Error ? e.message : "Không xoá được."}`);
    }
  };

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="LOẠI HÀNG (NHÓM HÀNG)" />
      <p className="mb-3 ml-1 text-slate-500">Thêm / sửa / xoá loại hàng và sắp xếp thứ tự hiện trên kiosk.</p>

      {!form && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setForm({ ...blank })}
            className="min-h-touch rounded-2xl bg-teal-600 py-3 text-base font-extrabold text-white"
          >
            ➕ Thêm loại hàng
          </button>
          <button
            onClick={() => setForm({ ...blank, is_group: true })}
            className="min-h-touch rounded-2xl bg-slate-600 py-3 text-base font-extrabold text-white"
          >
            ➕ Thêm nhóm cha
          </button>
        </div>
      )}

      {form && (
        <div className="mt-card mb-3 rounded-2xl border-2 border-emerald-200 bg-white p-4">
          <div className="font-extrabold">{form.old_name ? `Sửa: ${form.old_name}` : form.is_group ? "Nhóm cha mới" : "Loại hàng mới"}</div>
          <label className="mt-2 block text-sm font-bold text-slate-600">{form.is_group ? "Tên nhóm cha" : "Tên loại hàng"}</label>
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="VD: Thuốc thú y"
            className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
          />
          {!form.is_group && (
            <>
              <label className="mt-3 block text-sm font-bold text-slate-600">Thuộc nhóm cha</label>
              <select
                value={form.parent}
                onChange={(e) => setForm({ ...form, parent: e.target.value })}
                className="mt-1 w-full rounded-lg border-2 border-emerald-300 bg-white p-2.5"
              >
                <option value="">— Không có (nhóm gốc) —</option>
                {parents.map((p) => (
                  <option key={p.name} value={p.name}>{p.icon} {p.name}</option>
                ))}
              </select>
            </>
          )}
          <label className="mt-3 block text-sm font-bold text-slate-600">Biểu tượng</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => setForm({ ...form, icon: ic })}
                className={`grid h-10 w-10 place-items-center rounded-lg border-2 text-xl ${form.icon === ic ? "border-brand bg-brand-light" : "border-slate-200 bg-white"}`}
                aria-label={`Biểu tượng ${ic}`}
              >
                {ic}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-sm font-bold text-slate-600">Màu nền</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setForm({ ...form, color: c })}
                style={{ background: c }}
                className={`h-9 w-9 rounded-full border-2 ${form.color === c ? "border-brand ring-2 ring-brand/40" : "border-slate-200"}`}
                aria-label={`Màu ${c}`}
              />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={saveCategory} disabled={busy} className="flex-1 rounded-xl bg-brand py-3 font-extrabold text-white disabled:opacity-50">
              {busy ? "Đang lưu..." : "💾 Lưu"}
            </button>
            <button onClick={() => setForm(null)} className="rounded-xl bg-slate-200 px-4 font-bold">Huỷ</button>
          </div>
        </div>
      )}

      {loading ? (
        <PageLoading />
      ) : items.length === 0 && parents.length === 0 ? (
        <div className="mt-card p-6 text-center text-slate-400">Chưa có loại hàng nào. Bấm &quot;➕ Thêm loại hàng&quot;.</div>
      ) : (
        <>
          <div className="mt-card divide-y divide-slate-100 p-2">
            {items.map((c, i) => {
              // Header when the parent changes (the list is grouped by parent) — so the owner sees
              // which loại is a child of which nhóm cha.
              const showHeader = i === 0 || items[i - 1].parent !== c.parent;
              return (
              <div key={c.category}>
                {showHeader && (
                  <div className="flex items-center gap-1.5 px-1 pb-1 pt-3 text-sm font-extrabold text-slate-500 first:pt-1">
                    <span className="min-w-0 flex-1 truncate">{c.parent ? `${parentIcon(c.parent)} ${c.parent}` : `📦 ${NO_PARENT}`}</span>
                    {c.parent && (() => {
                      const pi = parents.findIndex((p) => p.name === c.parent);
                      return (
                        <>
                          <button onClick={() => setForm({ old_name: c.parent!, name: c.parent!, icon: parentIcon(c.parent!), color: COLORS[0], parent: "", is_group: true })} aria-label="Sửa nhóm cha" className="h-8 w-8 rounded-lg bg-slate-100 text-base">✏️</button>
                          <button onClick={() => removeName(c.parent!, "nhóm cha")} aria-label="Xoá nhóm cha" className="h-8 w-8 rounded-lg bg-red-50 text-base">🗑</button>
                          <button onClick={() => moveParent(pi, -1)} disabled={pi <= 0} aria-label="Nhóm lên" className="h-8 w-8 rounded-lg bg-brand-light text-base font-extrabold text-brand-dark disabled:opacity-30">▲</button>
                          <button onClick={() => moveParent(pi, 1)} disabled={pi >= parents.length - 1} aria-label="Nhóm xuống" className="h-8 w-8 rounded-lg bg-brand-light text-base font-extrabold text-brand-dark disabled:opacity-30">▼</button>
                        </>
                      );
                    })()}
                  </div>
                )}
                <div className="flex items-center gap-2 py-2.5 pl-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-2xl" style={{ background: c.color }}>
                  {c.icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-[17px] font-bold text-brand-dark">{c.category}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{c.count}</span>
                <button onClick={() => setForm({ old_name: c.category, name: c.category, icon: c.icon, color: c.color, parent: c.parent || "", is_group: false })} aria-label="Sửa" className="h-10 w-10 rounded-xl bg-slate-100 text-lg">
                  ✏️
                </button>
                <button onClick={() => removeName(c.category, "loại hàng")} aria-label="Xoá" className="h-10 w-10 rounded-xl bg-red-50 text-lg">
                  🗑
                </button>
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Lên" className="h-10 w-9 rounded-xl bg-brand-light text-lg font-extrabold text-brand-dark disabled:opacity-30">
                  ▲
                </button>
                <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Xuống" className="h-10 w-9 rounded-xl bg-brand-light text-lg font-extrabold text-brand-dark disabled:opacity-30">
                  ▼
                </button>
                </div>
              </div>
              );
            })}
            {/* Nhóm cha chưa có loại hàng con — vẫn hiện để sửa / xoá / sắp xếp. */}
            {parents.filter((p) => !items.some((c) => c.parent === p.name)).map((p) => {
              const pi = parents.findIndex((x) => x.name === p.name);
              return (
                <div key={`empty:${p.name}`} className="flex items-center gap-1.5 px-1 pb-1 pt-3 text-sm font-extrabold text-slate-500">
                  <span className="min-w-0 flex-1 truncate">{p.icon} {p.name} <span className="font-normal text-slate-400">(trống)</span></span>
                  <button onClick={() => setForm({ old_name: p.name, name: p.name, icon: p.icon, color: COLORS[0], parent: "", is_group: true })} aria-label="Sửa nhóm cha" className="h-8 w-8 rounded-lg bg-slate-100 text-base">✏️</button>
                  <button onClick={() => removeName(p.name, "nhóm cha")} aria-label="Xoá nhóm cha" className="h-8 w-8 rounded-lg bg-red-50 text-base">🗑</button>
                  <button onClick={() => moveParent(pi, -1)} disabled={pi <= 0} aria-label="Nhóm lên" className="h-8 w-8 rounded-lg bg-brand-light text-base font-extrabold text-brand-dark disabled:opacity-30">▲</button>
                  <button onClick={() => moveParent(pi, 1)} disabled={pi >= parents.length - 1} aria-label="Nhóm xuống" className="h-8 w-8 rounded-lg bg-brand-light text-base font-extrabold text-brand-dark disabled:opacity-30">▼</button>
                </div>
              );
            })}
          </div>
          <button onClick={saveOrder} disabled={busy} className="mt-4 min-h-touch w-full rounded-2xl bg-brand py-4 text-xl font-extrabold text-white shadow-soft disabled:opacity-50">
            {busy ? "Đang lưu..." : "💾 Lưu thứ tự"}
          </button>
        </>
      )}
    </div>
  );
}
