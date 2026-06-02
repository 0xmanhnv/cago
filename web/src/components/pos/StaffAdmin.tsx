"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { ALL_CAPS, CAP_LABELS, type Cap } from "@/lib/caps";
import { BackBar, Ok, Warn } from "@/components/owner/OwnerShared";

interface Staff {
  user: string;
  full_name: string;
  enabled: boolean;
  is_owner: boolean;
  caps: Cap[];
  allow_price_edit: boolean;
  max_discount_pct: number;
}

export function StaffAdmin() {
  const router = useRouter();
  const [list, setList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Staff | null>(null); // the staff being edited (a working copy)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<React.ReactNode>(null);

  const reload = () =>
    frappeCall<Staff[]>("cago.api.staff_admin.list_staff", {}, { method: "GET" })
      .then((r) => setList(r || []))
      .finally(() => setLoading(false));
  useEffect(() => {
    void reload();
  }, []);

  const toggleCap = (c: Cap) =>
    setEdit((s) => (s ? { ...s, caps: s.caps.includes(c) ? s.caps.filter((x) => x !== c) : [...s.caps, c] } : s));

  const save = async () => {
    if (!edit || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await frappeCall("cago.api.staff_admin.save_staff", {
        user: edit.user,
        caps: JSON.stringify(edit.caps),
        allow_price_edit: edit.allow_price_edit ? 1 : 0,
        max_discount_pct: edit.max_discount_pct || 0,
      });
      await reload();
      setEdit(null);
      setMsg(<Ok>✅ Đã lưu quyền cho {edit.full_name}.</Ok>);
    } catch (e) {
      setMsg(<Warn>{e instanceof Error ? e.message : "Lỗi: không lưu được."}</Warn>);
    } finally {
      setBusy(false);
    }
  };

  // ---- Editing one staff ----
  if (edit) {
    return (
      <div>
        <BackBar onBack={() => setEdit(null)} label="Quay lại" />
        <div className="rounded-xl bg-white p-4">
          <h2 className="text-xl font-bold">{edit.full_name}</h2>
          <div className="text-sm text-slate-500">{edit.user}</div>

          <div className="mt-3 font-bold text-brand-dark">Được dùng chức năng nào?</div>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ALL_CAPS.map((c) => (
              <label key={c} className={`flex items-center gap-2.5 rounded-xl border-2 p-3 ${edit.caps.includes(c) ? "border-brand bg-brand-light/40" : "border-slate-200 bg-white"}`}>
                <input type="checkbox" checked={edit.caps.includes(c)} onChange={() => toggleCap(c)} className="h-5 w-5" />
                <span className="font-bold">{CAP_LABELS[c]}</span>
              </label>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-amber-50 p-3">
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={edit.allow_price_edit}
                onChange={(e) => setEdit({ ...edit, allow_price_edit: e.target.checked })}
                className="h-5 w-5"
              />
              <span className="font-bold text-amber-800">Cho mặc cả / giảm giá khi bán</span>
            </label>
            {edit.allow_price_edit && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-slate-600">Giảm tối đa</span>
                <input
                  inputMode="numeric"
                  value={String(edit.max_discount_pct ?? 0)}
                  onChange={(e) => setEdit({ ...edit, max_discount_pct: Math.max(0, Math.min(100, parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 0)) })}
                  className="h-10 w-20 rounded-lg border-2 border-amber-300 px-2 text-right text-lg font-bold"
                />
                <span className="font-bold text-amber-800">%</span>
                <span className="text-xs text-slate-500">(0 = không được giảm)</span>
              </div>
            )}
          </div>

          <button onClick={save} disabled={busy} className="mt-4 min-h-touch w-full rounded-xl bg-brand text-lg font-extrabold text-white disabled:opacity-50">
            {busy ? "Đang lưu..." : "Lưu quyền"}
          </button>
        </div>
      </div>
    );
  }

  // ---- List ----
  return (
    <div>
      <BackBar onBack={() => router.push("/pos")} title="NHÂN VIÊN & PHÂN QUYỀN" />
      {msg}
      {loading ? (
        <div className="py-6 text-center text-slate-500">Đang tải...</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl bg-white p-6 text-center text-slate-400">Chưa có nhân viên nào.</div>
      ) : (
        <>
          <p className="mb-2 ml-1 text-sm text-slate-500">Bấm vào một người để chọn quyền họ được dùng.</p>
          {list.map((s) => (
            <button
              key={s.user}
              onClick={() => !s.is_owner && setEdit({ ...s })}
              disabled={s.is_owner}
              className="mb-2 flex w-full items-center justify-between rounded-xl bg-white p-3.5 text-left shadow disabled:opacity-70"
            >
              <div className="min-w-0">
                <div className="font-bold">{s.full_name}</div>
                <div className="truncate text-sm text-slate-500">
                  {s.is_owner ? "Chủ cửa hàng — toàn quyền" : s.caps.length ? s.caps.map((c) => CAP_LABELS[c]).join(" · ") : "Chưa có quyền nào"}
                </div>
              </div>
              {!s.is_owner && <span className="shrink-0 text-slate-400">Sửa ›</span>}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
