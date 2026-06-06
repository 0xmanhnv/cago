"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall, login } from "@/lib/api";
import { useSession } from "@/lib/session";
import { isInternal } from "@/lib/caps";
import { initMiniApp, telegramInitData } from "@/lib/miniapp";

export default function LoginPage() {
  const router = useRouter();
  const { boot, reload } = useSession();
  const brand = boot?.brand || "Minh Tuyết";
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // Inside the Telegram Mini App we try a password-less login first; show a spinner, not the form,
  // until that resolves so a linked owner/staff never sees the password box at all.
  const [autoTrying, setAutoTrying] = useState(false);

  const goHome = async () => {
    const b = await reload();
    // Any back-of-house user (holds a capability) → unified /pos; customers/guests → kiosk.
    router.push(isInternal(b) ? "/pos" : "/");
  };

  // One-tap login when opened as a Telegram Mini App: the bot's "Mở app" button opens us inside
  // Telegram with a signed initData; the backend verifies it and starts a session for the linked
  // account — no password. Falls through to the normal form if not linked / not in Telegram.
  useEffect(() => {
    initMiniApp();
    const initData = telegramInitData();
    if (!initData) return;
    setAutoTrying(true);
    (async () => {
      try {
        const r = await frappeCall<{ ok: boolean }>("cago.api.telegram.miniapp_login", { init_data: initData });
        if (r?.ok) {
          await goHome();
          return;
        }
      } catch {
        /* fall through to the manual form */
      }
      setAutoTrying(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!usr.trim() || !pwd) {
      setErr("Nhập tài khoản và mật khẩu.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await login(usr.trim(), pwd);
      await goHome();
    } catch {
      setErr("Sai tài khoản hoặc mật khẩu. Bác kiểm tra lại nhé.");
      setBusy(false);
    }
  };

  if (autoTrying) {
    return (
      <div className="flex min-h-[90vh] flex-col items-center justify-center gap-4 p-5">
        <div className="text-center text-3xl font-black text-brand">🌾 {brand}</div>
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-200 border-t-brand" />
        <div className="text-slate-500">Đang đăng nhập qua Telegram…</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[90vh] items-center justify-center p-5">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-7 shadow-xl">
        <div className="text-center text-3xl font-black text-brand">🌾 {brand}</div>
        <div className="mb-5 mt-1 text-center text-lg text-slate-500">Đăng nhập cửa hàng</div>

        <label htmlFor="usr" className="mb-1 mt-3 block font-bold text-slate-700">
          Số điện thoại / Email / Tài khoản
        </label>
        <input
          id="usr"
          name="username"
          value={usr}
          onChange={(e) => setUsr(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="VD: 0987654321 hoặc email"
          className="w-full rounded-xl border-2 border-emerald-300 p-3.5 text-lg"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        <label htmlFor="pwd" className="mb-1 mt-3 block font-bold text-slate-700">
          Mật khẩu
        </label>
        <div className="relative">
          <input
            id="pwd"
            name="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            type={showPwd ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border-2 border-emerald-300 p-3.5 pr-14 text-lg"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button
            type="button"
            onClick={() => setShowPwd((s) => !s)}
            aria-label={showPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-xl text-slate-500 active:bg-slate-100"
          >
            {showPwd ? "🙈" : "👁️"}
          </button>
        </div>

        <button
          onClick={submit}
          disabled={busy}
          className="mt-4 min-h-[58px] w-full rounded-xl bg-brand text-xl font-extrabold text-white disabled:opacity-60"
        >
          {busy ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
        {err && <div className="mt-3.5 rounded-lg bg-red-100 p-3 text-red-700">{err}</div>}
      </div>
    </div>
  );
}
