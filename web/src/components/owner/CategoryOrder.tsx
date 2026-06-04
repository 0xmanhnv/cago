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
  parent: string | null; // loại cha (cago_parent); null = top-level. A top-level can itself be a parent.
}
interface Parent {
  name: string;
  icon: string;
}

// Pastel swatches matching the kiosk category look.
const COLORS = ["#e6f4ea", "#fde8e8", "#fef3c7", "#e0f2fe", "#ede9fe", "#fce7f3", "#f3f4f6"];
const blank = { old_name: "", name: "", icon: "📦", color: COLORS[0], parent: "" };

export function CategoryOrder() {
  const router = useRouter();
  // Two-level state: top-level categories in order + their children in order. A category is a "parent"
  // simply by having children point at it — no separate flag.
  const [tops, setTops] = useState<Cat[]>([]);
  const [kids, setKids] = useState<Record<string, Cat[]>>({});
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
      .then(([cats, pars]) => {
        const list = cats || [];
        const topNames = new Set(list.filter((c) => !c.parent).map((c) => c.category));
        // Top-level = no parent, OR a child whose parent is missing (orphan → show as top-level).
        const topList = list.filter((c) => !c.parent || !topNames.has(c.parent!));
        const childMap: Record<string, Cat[]> = {};
        for (const c of list) {
          if (c.parent && topNames.has(c.parent)) (childMap[c.parent] ??= []).push(c);
        }
        setTops(topList);
        setKids(childMap);
        setParents(pars || []);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const swap = <T,>(arr: T[], i: number, dir: -1 | 1): T[] | null => {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return null;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  const moveTop = (i: number, dir: -1 | 1) => { const n = swap(tops, i, dir); if (n) setTops(n); };
  const moveChild = (parent: string, i: number, dir: -1 | 1) => {
    const n = swap(kids[parent] || [], i, dir);
    if (n) setKids({ ...kids, [parent]: n });
  };

  const saveOrder = async () => {
    setBusy(true);
    try {
      // One grouped 1..N list: each top-level followed by its children. The kiosk compares tops only
      // among tops and children only within their parent, so interleaved values stay correct.
      const flat = tops.flatMap((t) => [t.category, ...(kids[t.category] || []).map((c) => c.category)]);
      await frappeCall("cago.api.owner.set_category_order", { categories: JSON.stringify(flat) });
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
        parent: form.parent, // "" = loại gốc; a name = nằm trong loại cha đó
      });
      toast.success(form.old_name ? "Đã cập nhật." : "Đã thêm loại hàng.");
      setForm(null);
      load();
    } catch (e) {
      toast.error(`Lỗi: ${e instanceof Error ? e.message : "không lưu được."}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name: string) => {
    if (!(await confirmDialog(`Xoá loại hàng "${name}"?`, { danger: true, confirmLabel: "Xoá" }))) return;
    try {
      await frappeCall("cago.api.owner.delete_category", { name });
      toast.success("Đã xoá.");
      load();
    } catch (e) {
      toast.error(`${e instanceof Error ? e.message : "Không xoá được."}`);
    }
  };

  const openEdit = (c: Cat) => setForm({ old_name: c.category, name: c.category, icon: c.icon, color: c.color, parent: c.parent || "" });

  // One category row. `indent` shows it nested under its parent; ▲▼ reorder within its sibling scope.
  const Row = ({ c, indent, i, count, onUp, onDown }: { c: Cat; indent: boolean; i: number; count: number; onUp: () => void; onDown: () => void }) => (
    <div className={`flex items-center gap-2 py-2.5 ${indent ? "pl-8" : "pl-1"}`}>
      {indent && <span className="text-slate-300">↳</span>}
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-2xl" style={{ background: c.color }}>{c.icon}</span>
      <span className="min-w-0 flex-1 truncate text-[17px] font-bold text-brand-dark">{c.category}</span>
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">{c.count}</span>
      <button onClick={() => openEdit(c)} aria-label="Sửa" className="h-10 w-10 rounded-xl bg-slate-100 text-lg">✏️</button>
      <button onClick={() => remove(c.category)} aria-label="Xoá" className="h-10 w-10 rounded-xl bg-red-50 text-lg">🗑</button>
      <button onClick={onUp} disabled={i === 0} aria-label="Lên" className="h-10 w-9 rounded-xl bg-brand-light text-lg font-extrabold text-brand-dark disabled:opacity-30">▲</button>
      <button onClick={onDown} disabled={i === count - 1} aria-label="Xuống" className="h-10 w-9 rounded-xl bg-brand-light text-lg font-extrabold text-brand-dark disabled:opacity-30">▼</button>
    </div>
  );

  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="LOẠI HÀNG (NHÓM HÀNG)" />
      <p className="mb-3 ml-1 text-slate-500">Thêm / sửa / xoá loại hàng, chọn loại cha và sắp xếp thứ tự hiện trên kiosk. Loại không có cha chính là loại gốc (và có thể làm cha của loại khác).</p>

      {!form && (
        <button onClick={() => setForm({ ...blank })} className="mb-3 min-h-touch w-full rounded-2xl bg-teal-600 py-3 text-lg font-extrabold text-white">
          ➕ Thêm loại hàng
        </button>
      )}

      {form && (
        <div className="mt-card mb-3 rounded-2xl border-2 border-emerald-200 bg-white p-4">
          <div className="font-extrabold">{form.old_name ? `Sửa: ${form.old_name}` : "Loại hàng mới"}</div>
          <label className="mt-2 block text-sm font-bold text-slate-600">Tên loại hàng</label>
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="VD: Thuốc thú y"
            className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
          />
          <label className="mt-3 block text-sm font-bold text-slate-600">Thuộc loại cha</label>
          <select
            value={form.parent}
            onChange={(e) => setForm({ ...form, parent: e.target.value })}
            className="mt-1 w-full rounded-lg border-2 border-emerald-300 bg-white p-2.5"
          >
            <option value="">— Không có (loại gốc) —</option>
            {parents.filter((p) => p.name !== form.name).map((p) => (
              <option key={p.name} value={p.name}>{p.icon} {p.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-400">Xem loại cha trên kiosk sẽ gộp cả sản phẩm của loại con.</p>
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
      ) : tops.length === 0 ? (
        <div className="mt-card p-6 text-center text-slate-400">Chưa có loại hàng nào. Bấm &quot;➕ Thêm loại hàng&quot;.</div>
      ) : (
        <>
          <div className="mt-card divide-y divide-slate-100 p-2">
            {tops.map((t, ti) => (
              <div key={t.category}>
                <Row c={t} indent={false} i={ti} count={tops.length} onUp={() => moveTop(ti, -1)} onDown={() => moveTop(ti, 1)} />
                {(kids[t.category] || []).map((ch, ci) => (
                  <Row key={ch.category} c={ch} indent i={ci} count={(kids[t.category] || []).length} onUp={() => moveChild(t.category, ci, -1)} onDown={() => moveChild(t.category, ci, 1)} />
                ))}
              </div>
            ))}
          </div>
          <button onClick={saveOrder} disabled={busy} className="mt-4 min-h-touch w-full rounded-2xl bg-brand py-4 text-xl font-extrabold text-white shadow-soft disabled:opacity-50">
            {busy ? "Đang lưu..." : "💾 Lưu thứ tự"}
          </button>
        </>
      )}
    </div>
  );
}
