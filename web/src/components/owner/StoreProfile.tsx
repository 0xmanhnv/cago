"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { toast } from "@/components/ui/toast";
import { BackBar, goBackSmart } from "./Shared";

// "🏪 Thông tin cửa hàng" — owner edits the shop identity (name + contact) that prints on every
// receipt header and shows on the public order-tracking page. Name → Website Settings.app_name, the
// rest → Company custom fields (cago.api.store).
interface Profile {
  name: string;
  phone: string;
  address: string;
  hours: string;
  desc: string;
}

export function StoreProfile() {
  const router = useRouter();
  const [p, setP] = useState<Profile>({ name: "", phone: "", address: "", hours: "", desc: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    frappeCall<Profile>("cago.api.store.get_store_profile", {}, { method: "GET" })
      .then((d) => setP({ name: d.name || "", phone: d.phone || "", address: d.address || "", hours: d.hours || "", desc: d.desc || "" }))
      .catch(() => {});
  }, []);

  const save = async () => {
    if (saving) return;
    if (!p.name.trim()) {
      toast.error("Nhập tên cửa hàng.");
      return;
    }
    setSaving(true);
    try {
      await frappeCall("cago.api.store.set_store_profile", { name: p.name, phone: p.phone, address: p.address, hours: p.hours, desc: p.desc });
      toast.success("Đã lưu thông tin cửa hàng.");
    } catch {
      toast.error("Lỗi: không lưu được.");
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof Profile, opts: { placeholder?: string; tel?: boolean; area?: boolean } = {}) => (
    <div className="mt-3">
      <label className="block font-bold text-slate-700">{label}</label>
      {opts.area ? (
        <textarea
          value={p[key]}
          onChange={(e) => setP({ ...p, [key]: e.target.value })}
          placeholder={opts.placeholder}
          rows={2}
          className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
        />
      ) : (
        <input
          value={p[key]}
          onChange={(e) => setP({ ...p, [key]: e.target.value })}
          placeholder={opts.placeholder}
          inputMode={opts.tel ? "tel" : undefined}
          className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
        />
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-[760px]">
      <BackBar title="🏪 Thông tin cửa hàng" onBack={() => goBackSmart(router)} />
      <div className="mt-4 rounded-xl bg-white p-4">
        <p className="text-sm text-slate-500">Thông tin này in lên đầu hoá đơn cho khách và hiện ở trang theo dõi đơn.</p>
        {field("Tên cửa hàng", "name", { placeholder: "VD: Cửa hàng Minh Tuyết" })}
        {field("Số điện thoại", "phone", { placeholder: "VD: 0912345678", tel: true })}
        {field("Địa chỉ", "address", { placeholder: "VD: Cạnh UB xã Thịnh Thành, Yên Thành, Nghệ An", area: true })}
        {field("Giờ mở cửa", "hours", { placeholder: "VD: 06:00 - 22:00" })}
        {field("Mô tả ngắn", "desc", { placeholder: "VD: Thức ăn chăn nuôi · Phân bón · Thuốc BVTV · Giống", area: true })}
        <button onClick={save} disabled={saving} className="mt-4 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white disabled:opacity-50">
          {saving ? "Đang lưu…" : "💾 Lưu thông tin"}
        </button>
      </div>
    </div>
  );
}
