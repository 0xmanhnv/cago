"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall } from "@/lib/api";
import { BackBar, goBackSmart } from "./OwnerShared";
import { toast } from "@/components/ui/toast";
import { copyText, groupVnd, parseVnd } from "@/lib/utils";

export function Settings() {
  const router = useRouter();
  const [b, setB] = useState({ bank_bin: "", account: "", account_name: "" });
  const [debtVisible, setDebtVisible] = useState(false);
  const [priceEdit, setPriceEdit] = useState(false);
  const [staffCollect, setStaffCollect] = useState(false);
  const [loyalty, setLoyalty] = useState({ earn_vnd: "", redeem_vnd: "", on_credit: false });
  const [expiryDays, setExpiryDays] = useState("");
  const [proof, setProof] = useState({ debt_mode: "optional", debt_min: "", repay_mode: "optional", repay_min: "" });
  const [notify, setNotify] = useState({ owner_phone: "", webhook: "", token: "", has_token: false });
  const [cfdUrl, setCfdUrl] = useState("");
  const [cfdCopied, setCfdCopied] = useState(false);

  useEffect(() => {
    frappeCall<{ bin: string; account: string; name: string }>("cago.api.payment.get_bank", {}, { method: "GET" })
      .then((d) => setB({ bank_bin: d.bin || "", account: d.account || "", account_name: d.name || "" }))
      .catch(() => {});
    frappeCall<{ enabled: boolean }>("cago.api.verify.get_visible", {}, { method: "GET" })
      .then((d) => setDebtVisible(!!d.enabled))
      .catch(() => {});
    frappeCall<{ enabled: boolean }>("cago.api.verify.get_price_edit", {}, { method: "GET" })
      .then((d) => setPriceEdit(!!d.enabled))
      .catch(() => {});
    frappeCall<{ enabled: boolean }>("cago.api.verify.get_staff_collect_debt", {}, { method: "GET" })
      .then((d) => setStaffCollect(!!d.enabled))
      .catch(() => {});
    frappeCall<{ earn_vnd: number; redeem_vnd: number; on_credit: boolean }>("cago.api.verify.get_loyalty", {}, { method: "GET" })
      .then((d) => setLoyalty({ earn_vnd: String(d.earn_vnd || ""), redeem_vnd: String(d.redeem_vnd || ""), on_credit: !!d.on_credit }))
      .catch(() => {});
    frappeCall<{ days: number }>("cago.api.verify.get_expiry_warn", {}, { method: "GET" })
      .then((d) => setExpiryDays(String(d.days || "")))
      .catch(() => {});
    frappeCall<{ debt: { mode: string; min: number }; repay: { mode: string; min: number } }>("cago.api.verify.get_debt_proof", {}, { method: "GET" })
      .then((d) => setProof({ debt_mode: d.debt.mode, debt_min: String(d.debt.min || ""), repay_mode: d.repay.mode, repay_min: String(d.repay.min || "") }))
      .catch(() => {});
    frappeCall<{ owner_phone: string; webhook: string; has_token: boolean }>("cago.api.notify.get_notify_config", {}, { method: "GET" })
      .then((d) => setNotify({ owner_phone: d.owner_phone || "", webhook: d.webhook || "", token: "", has_token: !!d.has_token }))
      .catch(() => {});
    frappeCall<{ token: string }>("cago.api.display.cfd_token", {}, { method: "GET" })
      .then((d) => setCfdUrl(d.token ? `${window.location.origin}/display?k=${d.token}` : ""))
      .catch(() => {});
  }, []);

  const toggleDebt = async () => {
    const next = !debtVisible;
    await frappeCall("cago.api.verify.set_visible", { on: next ? 1 : 0 });
    setDebtVisible(next);
  };
  const togglePriceEdit = async () => {
    const next = !priceEdit;
    await frappeCall("cago.api.verify.set_price_edit", { on: next ? 1 : 0 });
    setPriceEdit(next);
  };
  const toggleStaffCollect = async () => {
    const next = !staffCollect;
    await frappeCall("cago.api.verify.set_staff_collect_debt", { on: next ? 1 : 0 });
    setStaffCollect(next);
  };

  const save = async () => {
    try {
      await frappeCall("cago.api.payment.save_bank", b);
      toast.success("Đã lưu tài khoản nhận tiền.");
    } catch {
      toast.error("Lỗi: không lưu được.");
    }
  };

  const saveLoyalty = async () => {
    try {
      const d = await frappeCall<{ earn_vnd: number; redeem_vnd: number; on_credit: boolean }>("cago.api.verify.set_loyalty", {
        earn_vnd: parseVnd(loyalty.earn_vnd),
        redeem_vnd: parseVnd(loyalty.redeem_vnd),
        on_credit: loyalty.on_credit ? 1 : 0,
      });
      setLoyalty({ earn_vnd: String(d.earn_vnd || ""), redeem_vnd: String(d.redeem_vnd || ""), on_credit: !!d.on_credit });
      toast.success("Đã lưu cài đặt tích điểm.");
    } catch {
      toast.error("Lỗi: không lưu được.");
    }
  };

  const saveNotify = async () => {
    try {
      const d = await frappeCall<{ owner_phone: string; webhook: string; has_token: boolean }>("cago.api.notify.set_notify_config", {
        owner_phone: notify.owner_phone,
        webhook: notify.webhook,
        ...(notify.token ? { token: notify.token } : {}),
      });
      setNotify({ owner_phone: d.owner_phone || "", webhook: d.webhook || "", token: "", has_token: !!d.has_token });
      toast.success("Đã lưu cài đặt nhắn tin.");
    } catch {
      toast.error("Lỗi: không lưu được.");
    }
  };

  const saveExpiry = async () => {
    try {
      const d = await frappeCall<{ days: number }>("cago.api.verify.set_expiry_warn", {
        days: parseInt(expiryDays.replace(/[^\d]/g, ""), 10) || 0,
      });
      setExpiryDays(String(d.days || ""));
      toast.success("Đã lưu cảnh báo cận hạn.");
    } catch {
      toast.error("Lỗi: không lưu được.");
    }
  };

  const saveProof = async () => {
    try {
      const d = await frappeCall<{ debt: { mode: string; min: number }; repay: { mode: string; min: number } }>("cago.api.verify.set_debt_proof", {
        debt_mode: proof.debt_mode,
        debt_min: parseInt((proof.debt_min || "").replace(/[^\d]/g, ""), 10) || 0,
        repay_mode: proof.repay_mode,
        repay_min: parseInt((proof.repay_min || "").replace(/[^\d]/g, ""), 10) || 0,
      });
      setProof({ debt_mode: d.debt.mode, debt_min: String(d.debt.min || ""), repay_mode: d.repay.mode, repay_min: String(d.repay.min || "") });
      toast.success("Đã lưu cách xác nhận nợ.");
    } catch {
      toast.error("Lỗi: không lưu được.");
    }
  };

  return (
    <div className="mx-auto max-w-[760px]">
      <BackBar onBack={() => goBackSmart(router)} title="QR THU TIỀN (VietQR)" />

      <div className="mt-4 rounded-xl bg-white p-4">
        <h2 className="font-extrabold text-brand-dark">✍️ Xác nhận nợ (số nợ số hoá)</h2>
        <p className="mt-1 text-sm text-slate-500">Yêu cầu khách ký / điểm chỉ / chụp ảnh khi ghi nợ hoặc khi trả nợ — thay cho việc ký sổ giấy.</p>
        {([
          { key: "debt", label: "Khi GHI NỢ", mk: "debt_mode" as const, nk: "debt_min" as const },
          { key: "repay", label: "Khi KHÁCH TRẢ NỢ", mk: "repay_mode" as const, nk: "repay_min" as const },
        ]).map((row) => (
          <div key={row.key} className="mt-3 border-t border-slate-100 pt-3">
            <div className="font-bold text-slate-700">{row.label}</div>
            <select
              value={proof[row.mk]}
              onChange={(e) => setProof({ ...proof, [row.mk]: e.target.value })}
              className="mt-1 w-full rounded-lg border-2 border-emerald-200 bg-white p-2.5"
            >
              <option value="off">Tắt — không cần xác nhận</option>
              <option value="optional">Gợi ý — hiện ô ký, có thể bỏ qua</option>
              <option value="required">Bắt buộc — phải ký/ảnh/người chứng</option>
            </select>
            {proof[row.mk] === "required" && (
              <div className="mt-2">
                <label className="text-sm text-slate-500">Chỉ bắt buộc khi số tiền ≥ (để 0 = luôn bắt buộc)</label>
                <input
                  inputMode="numeric"
                  value={proof[row.nk]}
                  onChange={(e) => setProof({ ...proof, [row.nk]: groupVnd(e.target.value) })}
                  placeholder="VD: 500.000"
                  className="mt-1 w-full rounded-lg border-2 border-emerald-200 p-2.5"
                />
              </div>
            )}
          </div>
        ))}
        <button onClick={saveProof} className="mt-4 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">💾 Lưu cách xác nhận nợ</button>
      </div>

      <div className="rounded-xl bg-white p-4">
        <p className="text-slate-500">Nhập tài khoản ngân hàng của cửa hàng để hiện mã QR cho khách chuyển khoản đúng số tiền.</p>
        <label className="mt-3 block font-bold text-slate-700">Mã ngân hàng (BIN)</label>
        <input value={b.bank_bin} onChange={(e) => setB({ ...b, bank_bin: e.target.value })} placeholder="VD: 970436 (Vietcombank)" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <label className="mt-3 block font-bold text-slate-700">Số tài khoản</label>
        <input value={b.account} onChange={(e) => setB({ ...b, account: e.target.value })} inputMode="numeric" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <label className="mt-3 block font-bold text-slate-700">Tên chủ tài khoản</label>
        <input value={b.account_name} onChange={(e) => setB({ ...b, account_name: e.target.value })} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <button onClick={save} className="mt-4 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
          💾 Lưu
        </button>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">Khách tự xem công nợ trên kiosk</div>
        <p className="text-slate-500">Khi bật: khách nhập SĐT ở kiosk, người bán bấm xác nhận, rồi khách xem được nợ của mình.</p>
        <label className="mt-2 flex items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={debtVisible} onChange={toggleDebt} className="h-5 w-5" />
          Cho phép xem công nợ trên kiosk
        </label>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">Cho phép sửa giá khi bán (mặc cả)</div>
        <p className="text-slate-500">Khi bật: lúc bán, người bán được sửa đơn giá từng mặt hàng (bớt giá cho khách). Khi tắt: luôn bán đúng bảng giá.</p>
        <label className="mt-2 flex items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={priceEdit} onChange={togglePriceEdit} className="h-5 w-5" />
          Cho phép sửa giá từng dòng ở màn hình bán
        </label>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">Cho phép nhân viên thu nợ khách</div>
        <p className="text-slate-500">Khi bật: nhân viên được ghi &quot;Khách trả nợ&quot; — tiền vào sổ quỹ ca của nhân viên đó và hệ thống ghi rõ ai thu. Khi tắt: chỉ chủ thu nợ.</p>
        <label className="mt-2 flex items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={staffCollect} onChange={toggleStaffCollect} className="h-5 w-5" />
          Cho phép nhân viên thu nợ
        </label>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">⭐ Tích điểm khách hàng</div>
        <p className="text-slate-500">Để trống = dùng mặc định (mua 10.000đ được 1 điểm; 1 điểm đổi được 1.000đ khi mua hàng).</p>
        <label className="mt-3 block font-bold text-slate-700">Mua bao nhiêu đồng = 1 điểm</label>
        <input
          inputMode="numeric"
          value={groupVnd(loyalty.earn_vnd)}
          onChange={(e) => setLoyalty({ ...loyalty, earn_vnd: String(parseVnd(e.target.value)) })}
          placeholder="VD: 10.000"
          className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
        />
        <label className="mt-3 block font-bold text-slate-700">1 điểm đổi được bao nhiêu đồng</label>
        <input
          inputMode="numeric"
          value={groupVnd(loyalty.redeem_vnd)}
          onChange={(e) => setLoyalty({ ...loyalty, redeem_vnd: String(parseVnd(e.target.value)) })}
          placeholder="VD: 1.000"
          className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5"
        />
        <label className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 p-2.5 font-bold text-slate-700">
          <input type="checkbox" checked={loyalty.on_credit} onChange={(e) => setLoyalty({ ...loyalty, on_credit: e.target.checked })} className="h-5 w-5" />
          Tích điểm cho cả đơn mua nợ
          <span className="font-normal text-slate-400">(tắt = chỉ tính điểm phần đã trả)</span>
        </label>
        <button onClick={saveLoyalty} className="mt-4 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
          💾 Lưu tích điểm
        </button>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">⏰ Cảnh báo cận hạn (HSD)</div>
        <p className="text-slate-500">Sản phẩm còn hạn dùng ≤ số ngày này sẽ hiện &quot;sắp hết hạn&quot;. Để trống = mặc định 60 ngày.</p>
        <input
          inputMode="numeric"
          value={expiryDays}
          onChange={(e) => setExpiryDays(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="VD: 60"
          className="mt-2 w-full rounded-lg border-2 border-emerald-300 p-2.5"
        />
        <button onClick={saveExpiry} className="mt-3 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
          💾 Lưu cảnh báo cận hạn
        </button>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">📩 Nhắn tin Zalo/SMS (tuỳ chọn)</div>
        <p className="text-slate-500">
          Số của chủ để nhận nhắc việc hằng ngày (hết hàng / cận hạn / công nợ). Muốn gửi tin cho khách
          ngay trong app, dán đường dẫn dịch vụ gửi tin (webhook nhận {"{phone, text}"}). Để trống = chỉ soạn nháp để sao chép.
        </p>
        <label className="mt-3 block font-bold text-slate-700">Số điện thoại chủ (nhận nhắc việc)</label>
        <input value={notify.owner_phone} onChange={(e) => setNotify({ ...notify, owner_phone: e.target.value })} inputMode="tel" placeholder="VD: 0912345678" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <label className="mt-3 block font-bold text-slate-700">Webhook gửi tin (tuỳ chọn)</label>
        <input value={notify.webhook} onChange={(e) => setNotify({ ...notify, webhook: e.target.value })} placeholder="https://..." className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <label className="mt-3 block font-bold text-slate-700">Token (tuỳ chọn){notify.has_token ? " — đã lưu" : ""}</label>
        <input value={notify.token} onChange={(e) => setNotify({ ...notify, token: e.target.value })} placeholder={notify.has_token ? "•••••• (để trống nếu giữ nguyên)" : "Bearer token"} className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <button onClick={saveNotify} className="mt-4 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
          💾 Lưu cài đặt nhắn tin
        </button>
      </div>

      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="font-extrabold">🖥 Màn hình phụ cho khách</div>
        <p className="text-slate-500">
          Để hiện giỏ hàng + tổng tiền + QR cho khách xem. Trên <b>cùng máy bán</b> (màn mở rộng): bấm nút
          “Mở màn hình phụ” ở trang chủ. Trên <b>tablet riêng</b> quay ra khách: mở trình duyệt tới đường dẫn
          dưới đây (đã có khoá bảo mật — thiết bị lạ không xem được).
        </p>
        {cfdUrl ? (
          <div className="mt-2 flex items-center gap-2">
            <input readOnly value={cfdUrl} className="min-w-0 flex-1 rounded-lg border-2 border-slate-200 bg-slate-50 p-2.5 text-sm" />
            <button
              onClick={async () => { if (await copyText(cfdUrl)) { setCfdCopied(true); setTimeout(() => setCfdCopied(false), 1500); } else { toast.error("Máy không cho tự sao chép — bác chọn đường dẫn rồi copy tay."); } }}
              className="shrink-0 rounded-lg bg-brand px-3 py-2.5 text-sm font-bold text-white"
            >
              {cfdCopied ? "✅ Đã chép" : "📋 Chép"}
            </button>
          </div>
        ) : (
          <div className="mt-2 text-sm text-slate-400">Đang tạo khoá…</div>
        )}
      </div>
    </div>
  );
}
