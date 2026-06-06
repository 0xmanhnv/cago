"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { frappeCall, login } from "@/lib/api";
import { useSession } from "@/lib/session";
import { isInternal } from "@/lib/caps";
import { initMiniApp, telegramInitData } from "@/lib/miniapp";
import { toast } from "@/components/ui/toast";

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
  // After a manual login INSIDE Telegram, offer to link this Telegram to the account just signed in —
  // the strongest link (verified initData + the password proves ownership; no bearer code needed).
  const [offerLink, setOfferLink] = useState(false);
  const [linking, setLinking] = useState(false);
  const bootRef = useRef<Awaited<ReturnType<typeof reload>> | null>(null);

  // Optional post-login destination from the Telegram "Mở app" deep link (?next=/pos/reports). Only
  // same-origin paths ("/…", not "//…") are honored — no open-redirect.
  const safeNext = () => {
    if (typeof window === "undefined") return "";
    try {
      const n = new URLSearchParams(window.location.search).get("next") || "";
      return n.startsWith("/") && !n.startsWith("//") ? n : "";
    } catch {
      return "";
    }
  };

  const finish = (b: Awaited<ReturnType<typeof reload>>) => {
    // Any back-of-house user (holds a capability) → unified /pos (or the requested screen); else kiosk.
    router.push(isInternal(b) ? safeNext() || "/pos" : "/");
  };

  // Navigate after a manual login / link offer, tolerant of a null cached boot (re-bootstrap so a
  // transient bootstrap failure right after login can never strand the user on the offer screen).
  const proceed = async () => {
    const b = bootRef.current ?? (await reload());
    finish(b);
  };

  // One-tap login when opened as a Telegram Mini App: the bot's "Mở app" button opens us inside
  // Telegram with a signed initData; the backend verifies it and starts a session for the linked
  // account — no password. Falls through to the normal form if not linked / not in Telegram.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Respect a deliberate logout: don't auto-login the still-linked user straight back in — but only
      // briefly (a Mini App WebView may persist, so a permanent skip could block auto-login forever).
      try {
        const t = Number(sessionStorage.getItem("cago_skip_autologin") || 0);
        if (t && Date.now() - t < 30_000) return; // recent logout → show the form
        if (t) sessionStorage.removeItem("cago_skip_autologin"); // stale → resume auto-login
      } catch {
        /* ignore */
      }
      initMiniApp();
      // The Telegram SDK loads afterInteractive, so initData may not be ready on the first tick — poll
      // briefly (≈2.5s, generous for a rural connection) before deciding this is a normal web visitor.
      let initData = telegramInitData();
      for (let i = 0; i < 10 && !initData && !cancelled; i++) {
        await new Promise((r) => setTimeout(r, 250));
        initMiniApp();
        initData = telegramInitData();
      }
      if (cancelled || !initData) return; // not in Telegram → keep the normal login form
      setAutoTrying(true);
      try {
        const r = await frappeCall<{ ok: boolean }>("cago.api.telegram.miniapp_login", { init_data: initData });
        if (r?.ok) {
          // miniapp_login only succeeds for a LINKED user, and only internal users can ever link → /pos
          // (or the requested screen) directly; don't route via a possibly-null boot.
          await reload();
          router.push(safeNext() || "/pos");
          return;
        }
      } catch {
        /* fall through to the manual form */
      }
      if (!cancelled) setAutoTrying(false);
    })();
    return () => {
      cancelled = true;
    };
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
      try {
        sessionStorage.removeItem("cago_skip_autologin"); // chose to sign in → re-enable auto-login next time
      } catch {
        /* ignore */
      }
      const b = await reload(); // establishes session + fresh CSRF for any follow-up POST
      bootRef.current = b;
      // In the Telegram Mini App and not yet linked → offer to bind this Telegram (skippable).
      if (telegramInitData()) {
        try {
          const ls = await frappeCall<{ linked: boolean }>("cago.api.telegram.link_status", {}, { method: "GET" });
          if (!ls.linked) {
            setOfferLink(true);
            setBusy(false);
            return;
          }
        } catch {
          /* link offer is best-effort — just proceed */
        }
      }
      finish(b);
    } catch {
      setErr("Sai tài khoản hoặc mật khẩu. Bác kiểm tra lại nhé.");
      setBusy(false);
    }
  };

  const doLink = async () => {
    if (linking) return;
    setLinking(true);
    try {
      await frappeCall("cago.api.telegram.link_current_telegram", { init_data: telegramInitData() });
      toast.success("Đã liên kết Telegram. Lần sau mở app từ Telegram khỏi đăng nhập.");
    } catch {
      toast.error("Chưa liên kết được — bạn có thể làm sau trong mục Liên kết mạng xã hội.");
    }
    await proceed();
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

  if (offerLink) {
    return (
      <div className="flex min-h-[90vh] items-center justify-center p-5">
        <div className="w-full max-w-[420px] rounded-2xl bg-white p-7 text-center shadow-xl">
          <div className="text-4xl">🔗</div>
          <div className="mt-2 text-xl font-extrabold text-slate-800">Liên kết Telegram này?</div>
          <p className="mt-2 text-slate-500">
            Liên kết tài khoản với Telegram bạn đang dùng để lần sau mở app từ Telegram <b>khỏi nhập mật khẩu</b>,
            và nhận lệnh trợ lý đúng quyền của bạn.
          </p>
          <button
            onClick={doLink}
            disabled={linking}
            className="mt-5 min-h-[56px] w-full rounded-xl bg-brand text-lg font-extrabold text-white disabled:opacity-60"
          >
            {linking ? "Đang liên kết…" : "🔗 Liên kết ngay"}
          </button>
          <button
            onClick={proceed}
            disabled={linking}
            className="mt-2 min-h-[48px] w-full rounded-xl font-bold text-slate-500 disabled:opacity-60"
          >
            Để sau
          </button>
        </div>
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
