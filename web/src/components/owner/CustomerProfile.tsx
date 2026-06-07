"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/dialog";
import { groupVnd, parseVnd } from "@/lib/utils";
import { PageLoading } from "@/components/ui/Loading";
import { BackBar, goBackSmart, money } from "./Shared";
import { initials } from "./Customers";

interface Order {
  invoice: string;
  date: string;
  total_text: string;
  is_return: boolean;
  unpaid: boolean;
}
interface Profile {
  customer: string;
  slug: string;
  customer_name: string;
  nickname: string;
  mobile: string;
  email: string;
  village: string;
  group: string;
  note: string;
  debt_limit: number;
  debt_limit_text: string;
  wholesale: boolean;
  points: number;
  unverified: boolean;
  outstanding: number;
  outstanding_text: string;
  total_spent_text: string;
  order_count: number;
  last_purchase: string;
  recent_orders: Order[];
}

type Form = {
  customer_name: string;
  nickname: string;
  mobile: string;
  email: string;
  village: string;
  group: string;
  note: string;
  debt_limit: string;
  wholesale: boolean;
};

const blankForm: Form = { customer_name: "", nickname: "", mobile: "", email: "", village: "", group: "", note: "", debt_limit: "", wholesale: false };
const fromProfile = (p: Profile): Form => ({
  customer_name: p.customer_name,
  nickname: p.nickname,
  mobile: p.mobile,
  email: p.email,
  village: p.village,
  group: p.group,
  note: p.note,
  debt_limit: p.debt_limit ? groupVnd(String(p.debt_limit)) : "",
  wholesale: p.wholesale,
});

const ddmm = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

// "🧑 Thông tin khách hàng" — one screen for a customer: avatar + info, lifetime stats, recent orders,
// and inline edit. `slug === "new"` switches to a create form. Read needs debt_view; save needs debt.
export function CustomerProfile({ slug }: { slug: string }) {
  const router = useRouter();
  const creating = slug === "new";
  const [p, setP] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!creating);
  const [editing, setEditing] = useState(creating);
  const [form, setForm] = useState<Form>(blankForm);
  const [groups, setGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    frappeCall<string[]>("cago.api.customers.customer_groups", {}, { method: "GET" }).then(setGroups).catch(() => {});
  }, []);
  useEffect(() => {
    if (creating) return;
    frappeCall<Profile>("cago.api.customers.get_customer_profile", { customer: slug }, { method: "GET" })
      .then((d) => {
        setP(d);
        setForm(fromProfile(d));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Không tải được khách hàng."))
      .finally(() => setLoading(false));
  }, [slug, creating]);

  const set = (k: keyof Form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (busy) return;
    if (!form.customer_name.trim()) {
      toast.error("Nhập tên khách hàng.");
      return;
    }
    setBusy(true);
    try {
      const args = {
        customer_name: form.customer_name.trim(),
        nickname: form.nickname.trim(),
        mobile: form.mobile.trim(),
        email: form.email.trim(),
        village: form.village.trim(),
        group: form.group,
        note: form.note.trim(),
        debt_limit: parseVnd(form.debt_limit) || 0,
        wholesale: form.wholesale ? 1 : 0,
      };
      const r = creating
        ? await frappeCall<Profile>("cago.api.customers.create_customer", args)
        : await frappeCall<Profile>("cago.api.customers.update_customer", { customer: p!.customer, ...args });
      toast.success(creating ? "Đã tạo khách hàng." : "Đã lưu.");
      if (creating) {
        router.replace(`/pos/customers/${encodeURIComponent(r.slug)}`);
      } else {
        setP(r);
        setForm(fromProfile(r));
        setEditing(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi: không lưu được.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoading />;

  // ---------- Edit / create form ----------
  if (editing) {
    const Field = ({ label, k, placeholder, tel, type }: { label: string; k: keyof Form; placeholder?: string; tel?: boolean; type?: string }) => (
      <div className="mt-2">
        <label className="block text-sm font-bold text-slate-600">{label}</label>
        <input
          value={form[k] as string}
          onChange={(e) => set(k, e.target.value)}
          inputMode={tel ? "tel" : type === "email" ? "email" : undefined}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
        />
      </div>
    );
    return (
      <div className="mx-auto max-w-[640px]">
        <BackBar onBack={() => (creating ? goBackSmart(router) : setEditing(false))} title={creating ? "➕ Thêm khách hàng" : "✏️ Sửa thông tin"} />
        <div className="rounded-xl bg-white p-4">
          <Field label="Tên khách hàng *" k="customer_name" placeholder="VD: Cô Ba" />
          <Field label="Tên thường gọi" k="nickname" placeholder="VD: Cô Ba xóm 5" />
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Field label="Số điện thoại" k="mobile" placeholder="VD: 0987654321" tel />
            <Field label="Email" k="email" placeholder="vd@email.com" type="email" />
          </div>
          <Field label="Địa chỉ / xóm" k="village" placeholder="VD: Xóm 5, Đông Hồ" />
          <div className="mt-2">
            <label className="block text-sm font-bold text-slate-600">Nhóm khách hàng</label>
            <select value={form.group} onChange={(e) => set("group", e.target.value)} className="mt-1 w-full rounded-lg border-2 border-emerald-300 bg-white p-2.5">
              <option value="">— Mặc định —</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="mt-2">
            <label className="block text-sm font-bold text-slate-600">Hạn mức nợ (để trống = không giới hạn)</label>
            <input value={form.debt_limit} onChange={(e) => set("debt_limit", groupVnd(e.target.value))} inputMode="numeric" placeholder="0" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          </div>
          <label className="mt-2 flex items-center gap-2.5 rounded-xl bg-slate-50 p-3">
            <input type="checkbox" checked={form.wholesale} onChange={(e) => set("wholesale", e.target.checked)} className="h-5 w-5" />
            <span className="font-bold text-slate-700">Khách sỉ (dùng bảng giá sỉ)</span>
          </label>
          <div className="mt-2">
            <label className="block text-sm font-bold text-slate-600">Ghi chú</label>
            <textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="Ghi chú về khách…" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
          </div>
          <button onClick={save} disabled={busy} className="mt-3 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white disabled:opacity-50">
            {busy ? "Đang lưu…" : creating ? "Tạo khách hàng" : "Cập nhật"}
          </button>
        </div>
      </div>
    );
  }

  if (!p) return <div className="rounded-xl bg-white p-6 text-center text-slate-400">Không tìm thấy khách hàng.</div>;

  // ---------- Profile (view) ----------
  const InfoRow = ({ label, value }: { label: string; value?: string }) =>
    value ? (
      <div className="flex justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
        <span className="shrink-0 text-slate-500">{label}</span>
        <span className="min-w-0 truncate text-right font-bold text-slate-800">{value}</span>
      </div>
    ) : null;

  return (
    <div className="mx-auto max-w-[680px]">
      <BackBar
        onBack={() => goBackSmart(router, "/pos/customers")}
        title="🧑 Thông tin khách hàng"
        right={
          <button onClick={() => setEditing(true)} className="shrink-0 rounded-xl bg-white/20 px-3 py-2 font-bold text-white active:bg-white/30">
            ✏️ Sửa
          </button>
        }
      />
      {/* Header card */}
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl font-extrabold text-brand">{initials(p.customer_name)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-extrabold text-slate-800">{p.customer_name}</div>
          {p.nickname ? <div className="truncate text-sm text-slate-500">{p.nickname}</div> : null}
          {p.mobile ? <a href={`tel:${p.mobile}`} className="text-sm font-bold text-brand">📞 {p.mobile}</a> : null}
        </div>
        {p.unverified ? <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Chưa duyệt</span> : null}
      </div>

      {/* Stats */}
      <div className="mt-3 grid grid-cols-3 gap-2.5 text-center">
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="text-xs text-slate-400">Tổng mua</div>
          <div className="mt-0.5 font-extrabold text-brand">{p.total_spent_text}</div>
        </div>
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="text-xs text-slate-400">Số đơn</div>
          <div className="mt-0.5 font-extrabold text-slate-700">{p.order_count}</div>
        </div>
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <div className="text-xs text-slate-400">Đang nợ</div>
          <div className={`mt-0.5 font-extrabold ${p.outstanding > 0 ? "text-red-600" : "text-slate-400"}`}>{p.outstanding > 0 ? money(p.outstanding) : "0đ"}</div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
        <InfoRow label="Email" value={p.email} />
        <InfoRow label="Địa chỉ / xóm" value={p.village} />
        <InfoRow label="Nhóm" value={p.group} />
        <InfoRow label="Hạn mức nợ" value={p.debt_limit_text} />
        <InfoRow label="Khách sỉ" value={p.wholesale ? "Có" : undefined} />
        <InfoRow label="Điểm tích lũy" value={p.points ? String(p.points) : undefined} />
        <InfoRow label="Mua gần nhất" value={ddmm(p.last_purchase)} />
        {p.note ? <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-sm text-slate-600">📝 {p.note}</div> : null}
      </div>

      {/* Quick debt actions */}
      <div className="mt-3 flex gap-2">
        <button onClick={() => router.push(`/pos/debt/${encodeURIComponent(p.slug)}`)} className="min-h-touch flex-1 rounded-xl border-2 border-emerald-200 bg-white font-bold text-brand-dark">📒 Sổ nợ</button>
        <button
          onClick={async () => {
            if (await confirmDialog("Gọi điện cho khách?")) window.location.href = `tel:${p.mobile}`;
          }}
          disabled={!p.mobile}
          className="min-h-touch flex-1 rounded-xl border-2 border-emerald-200 bg-white font-bold text-brand-dark disabled:opacity-40"
        >
          📞 Gọi
        </button>
      </div>

      {/* Recent orders */}
      <div className="mt-3 mb-10">
        <div className="mb-1.5 ml-1 font-bold text-brand-dark">Đơn gần nhất</div>
        {p.recent_orders.length === 0 ? (
          <div className="rounded-xl bg-white p-4 text-center text-sm text-slate-400">Chưa có đơn nào.</div>
        ) : (
          p.recent_orders.map((o) => (
            <div key={o.invoice} className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-bold">{ddmm(o.date)}</span>
                  {o.is_return ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">Trả hàng</span> : null}
                  {o.unpaid ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Còn nợ</span> : null}
                </div>
                <div className="truncate text-xs text-slate-400">{o.invoice}</div>
              </div>
              <div className="shrink-0 font-extrabold text-brand">{o.total_text}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
