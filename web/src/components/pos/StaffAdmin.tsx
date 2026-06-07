"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { ALL_CAPS, CAP_LABELS, type Cap } from "@/lib/caps";
import { BackBar, goBackSmart } from "@/components/owner/Shared";
import { confirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

import { PageLoading } from "@/components/ui/Loading";
interface Staff {
  user: string;
  full_name: string;
  enabled: boolean;
  is_owner: boolean;
  is_admin: boolean;
  job_roles: { name: string; title: string }[];
  caps: Cap[];
  allow_price_edit: boolean;
  max_discount_pct: number;
  blind_shift_close: boolean;
}
interface JobRole {
  name: string;
  title: string;
  description?: string;
  caps: Cap[];
  members: number;
}

export function StaffAdmin() {
  const router = useRouter();
  const [tab, setTab] = useState<"staff" | "roles">("staff");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [editStaff, setEditStaff] = useState<Staff | null>(null);
  const [editRole, setEditRole] = useState<(JobRole & { isNew?: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [pwNew, setPwNew] = useState(""); // reset-password field in the edit panel
  const [creating, setCreating] = useState<{ email: string; full_name: string; password: string; roles: string[] } | null>(null);

  const reload = async () => {
    const [s, r] = await Promise.all([
      frappeCall<Staff[]>("cago.api.staff_admin.list_staff", {}, { method: "GET" }),
      frappeCall<JobRole[]>("cago.api.staff_admin.list_job_roles", {}, { method: "GET" }),
    ]);
    setStaff(s || []);
    setRoles(r || []);
    setLoading(false);
  };
  useEffect(() => {
    void reload();
  }, []);

  // ---------- Edit one employee ----------
  if (editStaff) {
    const sel = new Set(editStaff.job_roles.map((j) => j.name));
    const effCaps = new Set<Cap>(); // union of selected job roles' caps (preview)
    roles.forEach((r) => sel.has(r.name) && r.caps.forEach((c) => effCaps.add(c)));
    const toggleRole = (r: JobRole) =>
      setEditStaff((s) =>
        s ? { ...s, job_roles: sel.has(r.name) ? s.job_roles.filter((j) => j.name !== r.name) : [...s.job_roles, { name: r.name, title: r.title }] } : s,
      );
    const save = async () => {
      if (busy) return;
      setBusy(true);
      try {
        // account (tên / bật-tắt / mật khẩu) + then caps & limits
        await frappeCall("cago.api.staff_admin.set_staff_account", {
          user: editStaff.user,
          full_name: editStaff.full_name,
          enabled: editStaff.enabled ? 1 : 0,
          new_password: pwNew.trim() || undefined,
        });
        await frappeCall("cago.api.staff_admin.save_staff", {
          user: editStaff.user,
          job_roles: JSON.stringify(editStaff.job_roles.map((j) => j.name)),
          allow_price_edit: editStaff.allow_price_edit ? 1 : 0,
          max_discount_pct: editStaff.max_discount_pct || 0,
          blind_shift_close: editStaff.blind_shift_close ? 1 : 0,
        });
        await reload();
        const name = editStaff.full_name;
        setEditStaff(null);
        setPwNew("");
        toast.success(`Đã lưu cho ${name}.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi: không lưu được.");
      } finally {
        setBusy(false);
      }
    };
    // Admin tier is granted per-person (not a chức danh): it's a separate, sensitive promotion that
    // unlocks the technical screens (Kết nối & Kênh / cấu hình AI / sao lưu) + full owner powers.
    const toggleAdmin = async () => {
      if (busy || !editStaff) return;
      const turningOn = !editStaff.is_admin;
      const msg = turningOn
        ? `${editStaff.full_name} sẽ xem & sửa được cấu hình kỹ thuật (kênh Zalo/Telegram, khoá AI, sao lưu) và có toàn quyền như chủ. Chỉ cấp cho người bạn thật sự tin tưởng.`
        : `${editStaff.full_name} sẽ mất quyền truy cập các màn cấu hình kỹ thuật.`;
      const ok = await confirmDialog(msg, {
        title: turningOn ? "Cấp quyền Quản trị kỹ thuật?" : "Thu quyền Quản trị kỹ thuật?",
        confirmLabel: turningOn ? "Cấp quyền" : "Thu quyền",
        danger: turningOn,
      });
      if (!ok) return;
      setBusy(true);
      try {
        const row = await frappeCall<Staff>("cago.api.staff_admin.set_staff_admin", { user: editStaff.user, on: turningOn ? 1 : 0 });
        setEditStaff(row);
        await reload();
        toast.success(turningOn ? "Đã cấp quyền quản trị." : "Đã thu quyền quản trị.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi: không đổi được quyền.");
      } finally {
        setBusy(false);
      }
    };
    return (
      <div>
        <BackBar onBack={() => { setEditStaff(null); setPwNew(""); }} title="Sửa nhân viên" />
        <div className="rounded-xl bg-white p-4">
          <div className="text-sm text-slate-500">{editStaff.user}</div>

          {/* Account: tên / bật-tắt / đổi mật khẩu */}
          <label className="mt-2 block text-sm font-bold text-slate-600">Tên nhân viên</label>
          <input
            value={editStaff.full_name}
            onChange={(e) => setEditStaff({ ...editStaff, full_name: e.target.value })}
            className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
          />
          <label className="mt-2 flex items-center gap-2.5 rounded-xl bg-slate-50 p-3">
            <input type="checkbox" checked={editStaff.enabled} onChange={(e) => setEditStaff({ ...editStaff, enabled: e.target.checked })} className="h-5 w-5" />
            <span className="font-bold text-slate-700">Đang làm việc (tắt = nghỉ việc, không đăng nhập được)</span>
          </label>
          <label className="mt-2 block text-sm font-bold text-slate-600">Đặt lại mật khẩu (để trống = giữ nguyên)</label>
          <input
            value={pwNew}
            onChange={(e) => setPwNew(e.target.value)}
            placeholder="Mật khẩu mới"
            className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
          />

          <div className="mt-3 font-bold text-brand-dark">Chức danh (chọn nhiều)</div>
          {roles.length === 0 ? (
            <div className="mt-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Chưa có chức danh nào. Sang tab “Chức danh” để tạo.</div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              {roles.map((r) => (
                <button
                  key={r.name}
                  onClick={() => toggleRole(r)}
                  className={`rounded-full border-2 px-3.5 py-2 text-sm font-bold ${sel.has(r.name) ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-600"}`}
                >
                  {r.title}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <div className="text-sm font-bold text-slate-500">Quyền hiệu lực</div>
            <div className="mt-1 text-sm">
              {effCaps.size ? [...effCaps].map((c) => CAP_LABELS[c]).join(" · ") : "Chưa có quyền nào"}
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-amber-50 p-3">
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={editStaff.allow_price_edit} onChange={(e) => setEditStaff({ ...editStaff, allow_price_edit: e.target.checked })} className="h-5 w-5" />
              <span className="font-bold text-amber-800">Cho mặc cả / giảm giá khi bán</span>
            </label>
            {editStaff.allow_price_edit && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-slate-600">Giảm tối đa</span>
                <input
                  inputMode="numeric"
                  value={String(editStaff.max_discount_pct ?? 0)}
                  onChange={(e) => setEditStaff({ ...editStaff, max_discount_pct: Math.max(0, Math.min(100, parseInt(e.target.value.replace(/[^\d]/g, ""), 10) || 0)) })}
                  className="h-10 w-20 rounded-lg border-2 border-amber-300 px-2 text-right text-lg font-bold"
                />
                <span className="font-bold text-amber-800">%</span>
                <span className="text-xs text-slate-500">(0 = không được giảm)</span>
              </div>
            )}
          </div>

          <label className="mt-3 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
            <input type="checkbox" checked={editStaff.blind_shift_close} onChange={(e) => setEditStaff({ ...editStaff, blind_shift_close: e.target.checked })} className="mt-0.5 h-5 w-5" />
            <span>
              <span className="font-bold">Đóng ca không cho xem tiền dự kiến</span>
              <span className="block text-xs text-slate-500">Nhân viên đếm két rồi nhập, không thấy số máy tính ra — chống gian lận. Chủ vẫn thấy chênh lệch ở Sổ quỹ.</span>
            </span>
          </label>

          {/* Technical-admin promotion — separate from chức danh, applied immediately (not via Lưu). */}
          <div className={`mt-3 rounded-xl border-2 p-3 ${editStaff.is_admin ? "border-slate-700 bg-slate-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-start justify-between gap-3">
              <span>
                <span className="font-bold">⚙️ Quản trị kỹ thuật{editStaff.is_admin ? " — đang bật" : ""}</span>
                <span className="block text-xs text-slate-500">Mở các màn cấu hình kỹ thuật (Kết nối &amp; Kênh, cấu hình AI, sao lưu) và toàn quyền như chủ. Chỉ cấp cho người thật sự tin tưởng.</span>
              </span>
              <button
                onClick={toggleAdmin}
                disabled={busy}
                className={`min-h-touch shrink-0 rounded-xl px-4 font-extrabold disabled:opacity-50 ${editStaff.is_admin ? "border-2 border-slate-600 text-slate-700" : "bg-slate-700 text-white"}`}
              >
                {editStaff.is_admin ? "Thu quyền" : "Cấp quyền"}
              </button>
            </div>
          </div>

          <button onClick={save} disabled={busy} className="mt-4 min-h-touch w-full rounded-xl bg-brand text-lg font-extrabold text-white disabled:opacity-50">
            {busy ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </div>
    );
  }

  // ---------- Create a new employee account ----------
  if (creating) {
    const sel = new Set(creating.roles);
    const create = async () => {
      if (busy) return;
      if (!creating.email.trim() || !creating.full_name.trim()) {
        toast.error("Nhập email và tên nhân viên.");
        return;
      }
      setBusy(true);
      try {
        await frappeCall("cago.api.staff_admin.create_staff", {
          email: creating.email.trim(),
          full_name: creating.full_name.trim(),
          password: creating.password.trim() || undefined,
          job_roles: JSON.stringify(creating.roles),
        });
        await reload();
        setCreating(null);
        toast.success("Đã tạo nhân viên.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi: không tạo được.");
      } finally {
        setBusy(false);
      }
    };
    return (
      <div>
        <BackBar onBack={() => setCreating(null)} title="➕ Thêm nhân viên" />
        <div className="rounded-xl bg-white p-4">
          <h2 className="text-xl font-bold">Thêm nhân viên</h2>
          <label className="mt-2 block text-sm font-bold text-slate-600">Email (dùng để đăng nhập)</label>
          <input
            value={creating.email}
            onChange={(e) => setCreating({ ...creating, email: e.target.value })}
            placeholder="nhanvien@cuahang.com"
            className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
          />
          <label className="mt-2 block text-sm font-bold text-slate-600">Tên nhân viên</label>
          <input
            value={creating.full_name}
            onChange={(e) => setCreating({ ...creating, full_name: e.target.value })}
            placeholder="VD: Chị Hoa"
            className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
          />
          <label className="mt-2 block text-sm font-bold text-slate-600">Mật khẩu</label>
          <input
            value={creating.password}
            onChange={(e) => setCreating({ ...creating, password: e.target.value })}
            placeholder="Mật khẩu đăng nhập"
            className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
          />
          <div className="mt-3 font-bold text-brand-dark">Chức danh (chọn nhiều)</div>
          {roles.length === 0 ? (
            <div className="mt-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Chưa có chức danh nào. Sang tab “Chức danh” để tạo trước.</div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-2">
              {roles.map((r) => (
                <button
                  key={r.name}
                  onClick={() =>
                    setCreating({ ...creating, roles: sel.has(r.name) ? creating.roles.filter((n) => n !== r.name) : [...creating.roles, r.name] })
                  }
                  className={`rounded-full border-2 px-3.5 py-2 text-sm font-bold ${sel.has(r.name) ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-600"}`}
                >
                  {r.title}
                </button>
              ))}
            </div>
          )}
          <button onClick={create} disabled={busy} className="mt-4 min-h-touch w-full rounded-xl bg-brand text-lg font-extrabold text-white disabled:opacity-50">
            {busy ? "Đang tạo..." : "Tạo nhân viên"}
          </button>
        </div>
      </div>
    );
  }

  // ---------- Edit / create one chức danh ----------
  if (editRole) {
    const toggleCap = (c: Cap) =>
      setEditRole((r) => (r ? { ...r, caps: r.caps.includes(c) ? r.caps.filter((x) => x !== c) : [...r.caps, c] } : r));
    const orig = roles.find((r) => r.name === editRole.name);
    const save = async () => {
      if (busy) return;
      if (!editRole.title.trim()) { toast.error("Nhập tên chức danh."); return; }
      // Removing a capability from a chức danh affects every member → confirm.
      const removed = (orig?.caps || []).filter((c) => !editRole.caps.includes(c));
      if (orig && orig.members > 0 && removed.length) {
        if (!(await confirmDialog(`Bớt quyền sẽ ảnh hưởng ${orig.members} nhân viên đang dùng chức danh này. Tiếp tục?`, { danger: true, confirmLabel: "Lưu" }))) return;
      }
      setBusy(true);
      try {
        await frappeCall("cago.api.staff_admin.save_job_role", {
          name: editRole.isNew ? undefined : editRole.name,
          title: editRole.title.trim(),
          description: editRole.description || undefined,
          caps: JSON.stringify(editRole.caps),
        });
        await reload();
        setEditRole(null);
        toast.success("Đã lưu chức danh.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi: không lưu được.");
      } finally {
        setBusy(false);
      }
    };
    const del = async () => {
      if (busy || editRole.isNew) return;
      if (!(await confirmDialog(`Xoá chức danh "${editRole.title}"?`, { danger: true, confirmLabel: "Xoá" }))) return;
      setBusy(true);
      try {
        await frappeCall("cago.api.staff_admin.delete_job_role", { name: editRole.name });
        await reload();
        setEditRole(null);
        toast.success("Đã xoá.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Không xoá được.");
      } finally {
        setBusy(false);
      }
    };
    return (
      <div>
        <BackBar onBack={() => setEditRole(null)} label="Quay lại" />
        <div className="rounded-xl bg-white p-4">
          <label className="font-bold text-brand-dark">Tên chức danh</label>
          <input
            value={editRole.title}
            onChange={(e) => setEditRole({ ...editRole, title: e.target.value })}
            placeholder="VD: Thu ngân"
            className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-3 text-lg"
          />
          {!editRole.isNew && orig && <div className="mt-1 text-sm text-slate-500">Đang dùng bởi {orig.members} nhân viên</div>}

          <div className="mt-3 font-bold text-brand-dark">Quyền của chức danh</div>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ALL_CAPS.map((c) => (
              <label key={c} className={`flex items-center gap-2.5 rounded-xl border-2 p-3 ${editRole.caps.includes(c) ? "border-brand bg-brand-light/40" : "border-slate-200 bg-white"}`}>
                <input type="checkbox" checked={editRole.caps.includes(c)} onChange={() => toggleCap(c)} className="h-5 w-5" />
                <span className="font-bold">{CAP_LABELS[c]}</span>
              </label>
            ))}
          </div>

          <button onClick={save} disabled={busy} className="mt-4 min-h-touch w-full rounded-xl bg-brand text-lg font-extrabold text-white disabled:opacity-50">
            {busy ? "Đang lưu..." : "Lưu chức danh"}
          </button>
          {!editRole.isNew && (
            <button onClick={del} disabled={busy} className="mt-2 min-h-touch w-full rounded-xl bg-red-50 text-lg font-extrabold text-red-600 disabled:opacity-50">
              🗑 Xoá chức danh
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---------- Lists ----------
  return (
    <div>
      <BackBar onBack={() => goBackSmart(router)} title="👥 Nhân viên & phân quyền" />
      <div className="mb-3 flex gap-2">
        <button onClick={() => setTab("staff")} className={`flex-1 rounded-xl px-3 py-2.5 font-bold ${tab === "staff" ? "bg-brand text-white" : "bg-brand-light text-brand-dark"}`}>👤 Nhân viên</button>
        <button onClick={() => setTab("roles")} className={`flex-1 rounded-xl px-3 py-2.5 font-bold ${tab === "roles" ? "bg-brand text-white" : "bg-brand-light text-brand-dark"}`}>🏷️ Chức danh</button>
      </div>

      {loading ? (
        <PageLoading />
      ) : tab === "staff" ? (
        <>
          <button
            onClick={() => setCreating({ email: "", full_name: "", password: "", roles: [] })}
            className="mb-3 min-h-touch w-full rounded-xl bg-teal-600 font-extrabold text-white"
          >
            ➕ Thêm nhân viên
          </button>
          {staff.length === 0 ? (
            <div className="rounded-xl bg-white p-6 text-center text-slate-400">Chưa có nhân viên nào.</div>
          ) : (
          <>
            <p className="mb-2 ml-1 text-sm text-slate-500">Bấm một người để sửa thông tin, chức danh + giới hạn.</p>
            <div className="md:grid md:grid-cols-2 md:gap-x-3">
            {staff.map((s) => (
              <button
                key={s.user}
                onClick={() => { if (!s.is_owner) { setPwNew(""); setEditStaff({ ...s }); } }}
                disabled={s.is_owner}
                className="mb-2 flex w-full items-center justify-between rounded-xl bg-white p-3.5 text-left shadow disabled:opacity-70"
              >
                <div className="min-w-0">
                  <div className="font-bold">{s.full_name}</div>
                  <div className="truncate text-sm text-slate-500">
                    {s.is_owner ? "Chủ cửa hàng — toàn quyền" : s.job_roles.length ? s.job_roles.map((j) => j.title).join(" · ") : "Chưa gán chức danh"}
                  </div>
                </div>
                {!s.is_owner && <span className="shrink-0 text-slate-400">Sửa ›</span>}
              </button>
            ))}
            </div>
          </>
          )}
        </>
      ) : (
        <>
          <button onClick={() => setEditRole({ name: "", title: "", caps: [], members: 0, isNew: true })} className="mb-3 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
            ➕ Tạo chức danh
          </button>
          {roles.length === 0 ? (
            <div className="rounded-xl bg-white p-6 text-center text-slate-400">Chưa có chức danh nào.</div>
          ) : (
            <div className="md:grid md:grid-cols-2 md:gap-x-3">
            {roles.map((r) => (
              <button key={r.name} onClick={() => setEditRole({ ...r })} className="mb-2 flex w-full items-center justify-between rounded-xl bg-white p-3.5 text-left shadow">
                <div className="min-w-0">
                  <div className="font-bold">{r.title}</div>
                  <div className="truncate text-sm text-slate-500">{r.caps.length ? r.caps.map((c) => CAP_LABELS[c]).join(" · ") : "Chưa có quyền"}</div>
                </div>
                <span className="shrink-0 text-sm text-slate-400">{r.members} người ›</span>
              </button>
            ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
