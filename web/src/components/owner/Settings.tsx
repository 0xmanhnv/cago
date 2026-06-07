"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { frappeCall } from "@/lib/api";
import { BackBar, goBackSmart } from "./Shared";
import { toast } from "@/components/ui/toast";
import { copyText, groupVnd, parseVnd } from "@/lib/utils";
import { TelegramLink } from "@/components/pos/TelegramLink";

export function Settings() {
  const router = useRouter();
  const [b, setB] = useState({ bank_bin: "", account: "", account_name: "" });
  const [debtVisible, setDebtVisible] = useState(false);
  const [priceEdit, setPriceEdit] = useState(false);
  const [staffCollect, setStaffCollect] = useState(false);
  const [loyalty, setLoyalty] = useState({ earn_vnd: "", redeem_vnd: "", on_credit: false });
  const [expiryDays, setExpiryDays] = useState("");
  const [proof, setProof] = useState({ debt_mode: "optional", debt_min: "", repay_mode: "optional", repay_min: "" });
  const [defLimit, setDefLimit] = useState("");
  // Owner's business contact phone only. All technical channel config (webhook/token, Telegram, Zalo)
  // lives on the admin-only "Kết nối & Kênh" screen (ConnectScreen / cago.api.integrations).
  const [notify, setNotify] = useState({ owner_phone: "", is_admin: false, notify_on_sale: false });
  const [cfdUrl, setCfdUrl] = useState("");
  const [cfdCopied, setCfdCopied] = useState(false);

  // Deep-link support: readiness ("Sửa →" for SĐT chủ / kênh nhắn tin) links to /pos/settings#notify
  // so we land on the messaging section instead of the top (QR). Scroll to it after first paint.
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#notify") return;
    const t = setTimeout(() => document.getElementById("notify")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    return () => clearTimeout(t);
  }, []);

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
    frappeCall<{ limit: number }>("cago.api.verify.get_default_debt_limit", {}, { method: "GET" })
      .then((d) => setDefLimit(String(d.limit || "")))
      .catch(() => {});
    frappeCall<{ owner_phone: string; is_admin: boolean; notify_on_sale: boolean }>("cago.api.notify.get_notify_config", {}, { method: "GET" })
      .then((d) => setNotify({ owner_phone: d.owner_phone || "", is_admin: !!d.is_admin, notify_on_sale: !!d.notify_on_sale }))
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
      // owner_phone is the only business field here; channels are on the admin Kết nối & Kênh screen.
      await frappeCall("cago.api.notify.set_notify_config", { owner_phone: notify.owner_phone });
      toast.success("Đã lưu số nhận nhắc việc.");
    } catch {
      toast.error("Lỗi: không lưu được.");
    }
  };

  const toggleNotifyOnSale = async () => {
    const next = !notify.notify_on_sale;
    setNotify({ ...notify, notify_on_sale: next }); // optimistic
    try {
      await frappeCall("cago.api.notify.set_notify_on_sale", { on: next ? 1 : 0 });
    } catch {
      setNotify({ ...notify, notify_on_sale: !next });
      toast.error("Lỗi: không đổi được.");
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

  const saveDefLimit = async () => {
    try {
      const d = await frappeCall<{ limit: number }>("cago.api.verify.set_default_debt_limit", { limit: parseVnd(defLimit) });
      setDefLimit(String(d.limit || ""));
      toast.success("Đã lưu hạn mức nợ mặc định.");
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
    <div className="">
      <BackBar onBack={() => goBackSmart(router)} title="⚙️ Cài đặt cửa hàng" />
      <div className="mx-auto max-w-[820px]">

      {/* Settings are split into 3 labelled groups (Bán hàng / Công nợ / Kết nối) so the owner can
          locate a switch at a glance instead of scrolling a wall of cards — learnt from a polished VN
          POS Settings screen, but we keep edit-in-place cards (NOT drill-down sub-screens, which add
          navigation depth that hurts a low-tech owner). On desktop each group flows into 2 masonry
          COLUMNS (short cards don't leave a gap); phones keep one column. Each card is
          break-inside-avoid so it never splits across a column. */}
      <h2 className="mb-2 ml-1 mt-5 font-extrabold text-slate-500">🛒 Bán hàng &amp; thanh toán</h2>
      <div className="xl:columns-2 xl:gap-4">
      <div className="break-inside-avoid rounded-xl bg-white p-4">
        <div className="font-extrabold">Cho phép sửa giá khi bán (mặc cả)</div>
        <p className="text-slate-500">Khi bật: lúc bán, người bán được sửa đơn giá từng mặt hàng (bớt giá cho khách). Khi tắt: luôn bán đúng bảng giá.</p>
        <label className="mt-2 flex items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={priceEdit} onChange={togglePriceEdit} className="h-5 w-5" />
          Cho phép sửa giá từng dòng ở màn hình bán
        </label>
      </div>

      <div className="mt-4 break-inside-avoid rounded-xl bg-white p-4">
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

      <div className="mt-4 break-inside-avoid rounded-xl bg-white p-4">
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

      <div className="mt-4 break-inside-avoid rounded-xl bg-white p-4">
        <h2 className="font-extrabold text-brand-dark">🏦 Tài khoản nhận chuyển khoản (QR)</h2>
        <p className="mt-1 text-slate-500">Nhập tài khoản ngân hàng của cửa hàng để hiện mã QR cho khách chuyển khoản đúng số tiền.</p>
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
      </div>

      <h2 className="mb-2 ml-1 mt-6 font-extrabold text-slate-500">📒 Công nợ khách</h2>
      <div className="xl:columns-2 xl:gap-4">
      <div className="break-inside-avoid rounded-xl bg-white p-4">
        <h2 className="font-extrabold text-brand-dark">📒 Hạn mức nợ mặc định</h2>
        <p className="mt-1 text-sm text-slate-500">Áp dụng cho khách CHƯA đặt hạn mức riêng. Vượt mức thì không cho ghi nợ thêm. Để 0 = không giới hạn.</p>
        <input
          inputMode="numeric"
          value={groupVnd(defLimit)}
          onChange={(e) => setDefLimit(String(parseVnd(e.target.value)))}
          placeholder="VD: 2.000.000 (0 = không giới hạn)"
          className="mt-2 w-full rounded-lg border-2 border-emerald-300 p-2.5"
        />
        <button onClick={saveDefLimit} className="mt-3 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">💾 Lưu hạn mức mặc định</button>
      </div>

      <div className="mt-4 break-inside-avoid rounded-xl bg-white p-4">
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

      <div className="mt-4 break-inside-avoid rounded-xl bg-white p-4">
        <div className="font-extrabold">Cho phép nhân viên thu nợ khách</div>
        <p className="text-slate-500">Khi bật: nhân viên được ghi &quot;Khách trả nợ&quot; — tiền vào sổ quỹ ca của nhân viên đó và hệ thống ghi rõ ai thu. Khi tắt: chỉ chủ thu nợ.</p>
        <label className="mt-2 flex items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={staffCollect} onChange={toggleStaffCollect} className="h-5 w-5" />
          Cho phép nhân viên thu nợ
        </label>
      </div>

      <div className="mt-4 break-inside-avoid rounded-xl bg-white p-4">
        <div className="font-extrabold">Khách tự xem công nợ trên kiosk</div>
        <p className="text-slate-500">Khi bật: khách nhập SĐT ở kiosk, người bán bấm xác nhận, rồi khách xem được nợ của mình.</p>
        <label className="mt-2 flex items-center gap-2 font-bold text-slate-700">
          <input type="checkbox" checked={debtVisible} onChange={toggleDebt} className="h-5 w-5" />
          Cho phép xem công nợ trên kiosk
        </label>
      </div>
      </div>

      <h2 className="mb-2 ml-1 mt-6 font-extrabold text-slate-500">🔌 Kết nối &amp; thiết bị</h2>
      <div className="xl:columns-2 xl:gap-4">
      <div id="notify" className="scroll-mt-20 break-inside-avoid rounded-xl bg-white p-4">
        <div className="font-extrabold">📩 Nhắc việc cho chủ</div>
        <p className="text-slate-500">
          Số của chủ để nhận nhắc việc hằng ngày (hết hàng / cận hạn / công nợ) qua Zalo/SMS — khi kênh gửi
          tin đã được bật.
        </p>
        <label className="mt-3 block font-bold text-slate-700">Số điện thoại chủ (nhận nhắc việc)</label>
        <input value={notify.owner_phone} onChange={(e) => setNotify({ ...notify, owner_phone: e.target.value })} inputMode="tel" placeholder="VD: 0912345678" className="mt-1 w-full rounded-lg border-2 border-emerald-300 p-2.5" />
        <button onClick={saveNotify} className="mt-4 min-h-touch w-full rounded-xl bg-brand font-extrabold text-white">
          💾 Lưu số nhận nhắc việc
        </button>
        <label className="mt-4 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
          <input type="checkbox" checked={notify.notify_on_sale} onChange={toggleNotifyOnSale} className="mt-0.5 h-5 w-5" />
          <span>
            <span className="font-bold">Báo Telegram/Zalo mỗi đơn bán</span>
            <span className="block text-xs text-slate-500">Bật: mỗi đơn bán xong gửi thông báo vào nhóm Telegram + Zalo chủ. Tắt (mặc định): chỉ báo đơn từ xa / gọi nhân viên / nhắc việc.</span>
          </span>
        </label>
        {notify.is_admin && (
          <p className="mt-3 text-sm text-slate-400">
            ⚙️ Cấu hình kênh gửi tin Zalo/SMS, Telegram và Zalo Mini App ở màn{" "}
            <Link href="/pos/integrations" className="font-bold text-brand underline">🔌 Kết nối & Kênh</Link> (quản trị).
          </p>
        )}
      </div>

      <div className="mt-4 break-inside-avoid">
        <TelegramLink />
      </div>

      <div className="mt-4 break-inside-avoid rounded-xl bg-white p-4">
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
      </div>
    </div>
  );
}
