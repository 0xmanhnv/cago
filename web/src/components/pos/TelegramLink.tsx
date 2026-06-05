"use client";

import { useEffect, useState } from "react";
import { frappeCall } from "@/lib/api";
import { toast } from "@/components/ui/toast";

// Self-service: any internal user (owner or staff) links THEIR OWN Telegram so the ops bot shows
// commands by their real role (owner → revenue/debt in a private chat; staff → operational). The
// deep link carries a one-time code; tapping it maps the sender's Telegram id to this account.
export function TelegramLink() {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [deepLink, setDeepLink] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    frappeCall<{ linked: boolean }>("cago.api.telegram.link_status", {}, { method: "GET" })
      .then((d) => setLinked(!!d.linked))
      .catch(() => setLinked(false));
  }, []);

  const link = async () => {
    setBusy(true);
    try {
      const d = await frappeCall<{ deep_link: string }>("cago.api.telegram.link_start", {});
      if (d.deep_link) {
        window.open(d.deep_link, "_blank");
        setDeepLink(d.deep_link);
      } else {
        toast.error("Chưa cấu hình Bot Telegram (nhờ quản trị ở màn Kết nối & Kênh).");
      }
    } catch {
      toast.error("Không tạo được liên kết.");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    try {
      await frappeCall("cago.api.telegram.unlink", {});
      setLinked(false);
      setDeepLink("");
      toast.success("Đã huỷ liên kết Telegram.");
    } catch {
      toast.error("Lỗi: không huỷ được.");
    }
  };

  return (
    <div className="rounded-xl bg-white p-4">
      <div className="font-extrabold">🔗 Liên kết Telegram của tôi</div>
      <p className="text-slate-500">
        Liên kết tài khoản Telegram để nhắn lệnh cho bot theo đúng quyền của bạn (chủ: <code>/doanhthu</code>,
        <code> /no</code> qua tin nhắn riêng; nhân viên: <code>/tonkho</code>…).
      </p>
      {linked === null ? (
        <div className="mt-3 text-slate-400">Đang kiểm tra…</div>
      ) : linked ? (
        <div className="mt-3 flex items-center gap-3">
          <span className="font-bold text-emerald-700">✅ Đã liên kết</span>
          <button onClick={unlink} className="rounded-lg border-2 border-red-300 px-3 py-1.5 text-sm font-bold text-red-600">
            Huỷ liên kết
          </button>
        </div>
      ) : (
        <>
          <button onClick={link} disabled={busy} className="mt-3 min-h-touch w-full rounded-xl bg-sky-600 font-extrabold text-white disabled:opacity-50">
            {busy ? "Đang tạo liên kết…" : "🔗 Liên kết Telegram"}
          </button>
          {deepLink && (
            <p className="mt-2 text-sm text-slate-500">
              Đã mở Telegram để xác nhận. Nếu chưa mở,{" "}
              <a href={deepLink} target="_blank" rel="noreferrer" className="font-bold text-brand underline">bấm vào đây</a>{" "}
              rồi bấm <b>Start</b> trong bot (mã hết hạn sau 10 phút).
            </p>
          )}
        </>
      )}
    </div>
  );
}
