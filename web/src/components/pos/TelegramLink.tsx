"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { frappeCall } from "@/lib/api";
import { toast } from "@/components/ui/toast";

interface LinkState {
  linked: boolean;
  handle?: string;
  linked_at?: string;
  pending?: string; // masked Telegram id awaiting owner-tier confirmation in-app
}

// Self-service: any internal user (owner or staff) links THEIR OWN Telegram so the ops bot shows
// commands by their real role. The deep link carries a one-time code; tapping it binds the sender's
// Telegram id to this account. OWNER-tier accounts get a step-up: the bot holds the link PENDING until
// it's confirmed here in the logged-in app (a stranger who intercepted the code can't finish it).
export function TelegramLink() {
  const [st, setSt] = useState<LinkState | null>(null);
  const [deepLink, setDeepLink] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await frappeCall<LinkState>("cago.api.telegram.link_status", {}, { method: "GET" });
      setSt(d);
      return d;
    } catch {
      setSt({ linked: false });
      return null;
    }
  }, []);

  // Poll while the screen is open so a redeemed link (and a pending owner request) shows up promptly.
  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

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
      toast.error("Không tạo được liên kết (thử lại sau ít phút).");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    try {
      const d = await frappeCall<LinkState>("cago.api.telegram.confirm_link", {});
      setSt(d);
      setDeepLink("");
      toast.success("Đã xác nhận liên kết Telegram.");
    } catch {
      toast.error("Yêu cầu đã hết hạn. Bấm Liên kết lại nhé.");
      refresh();
    }
  };

  const reject = async () => {
    try {
      const d = await frappeCall<LinkState>("cago.api.telegram.reject_link", {});
      setSt(d);
      toast.success("Đã từ chối yêu cầu liên kết.");
    } catch {
      toast.error("Lỗi, thử lại.");
    }
  };

  const unlink = async () => {
    try {
      await frappeCall("cago.api.telegram.unlink", {});
      setDeepLink("");
      await refresh();
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
        <code> /no</code> qua tin nhắn riêng; nhân viên: <code>/tonkho</code>…) và mở app khỏi nhập mật khẩu.
      </p>

      {st === null ? (
        <div className="mt-3 text-slate-400">Đang kiểm tra…</div>
      ) : st.pending ? (
        // Owner-tier step-up: a Telegram is waiting for this account to approve it here.
        <div className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
          <div className="font-bold text-amber-900">
            ⚠️ Có Telegram <b>{st.pending}</b> xin liên kết vào tài khoản chủ này.
          </div>
          <div className="mt-1 text-sm text-amber-800">Chỉ xác nhận nếu chính bạn vừa bấm liên kết trong Telegram.</div>
          <div className="mt-3 flex gap-2">
            <button onClick={confirm} className="min-h-touch flex-1 rounded-xl bg-brand font-extrabold text-white">
              ✅ Xác nhận liên kết
            </button>
            <button onClick={reject} className="min-h-touch rounded-xl border-2 border-red-300 px-4 font-bold text-red-600">
              Từ chối
            </button>
          </div>
        </div>
      ) : st.linked ? (
        <div className="mt-3">
          <div className="flex items-center gap-3">
            <span className="font-bold text-emerald-700">✅ Đã liên kết {st.handle}</span>
            <button onClick={unlink} className="rounded-lg border-2 border-red-300 px-3 py-1.5 text-sm font-bold text-red-600">
              Huỷ liên kết
            </button>
          </div>
          {st.linked_at && <div className="mt-1 text-sm text-slate-400">Liên kết lúc {st.linked_at}</div>}
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
              rồi bấm <b>Start</b> trong bot (mã hết hạn sau 10 phút). Tài khoản chủ sẽ cần bấm <b>Xác nhận</b> ở đây.
            </p>
          )}
        </>
      )}
    </div>
  );
}
