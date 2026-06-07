"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// "Thêm vào Màn hình chính" nudge → opens the PWA STANDALONE (no browser bars) = feels like a real app.
// iOS Safari has no install API, so we show the manual Share→Add steps; Android/desktop Chrome fire
// `beforeinstallprompt` → a one-tap install. Hidden when already standalone, inside Telegram, or dismissed.
interface BipEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: string }>;
}

export function InstallHint() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [bip, setBip] = useState<BipEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      const inTelegram = !!(window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData;
      const fixedKiosk = localStorage.getItem("cago_fixed_kiosk") === "1"; // shop's shared in-store tablet
      if (standalone || inTelegram || fixedKiosk) return; // already app-like / Telegram / fixed kiosk → no nudge
      if (localStorage.getItem("cago_install_off")) return;

      const ua = navigator.userAgent;
      // iOS Safari only (not Chrome/Firefox on iOS, which can't add-to-home-screen the same way).
      if (/iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)) {
        setIos(true);
        setShow(true);
        return;
      }
    } catch {
      /* ignore */
    }
    const onBip = (e: Event) => {
      e.preventDefault();
      setBip(e as BipEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  // Only nudge on the owner/staff HOME — not on every sub-screen (repetitive) and not on the kiosk
  // (a customer browsing the shared tablet / their phone shouldn't be told to install the shop's app).
  if (!show || pathname !== "/pos") return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem("cago_install_off", "1");
    } catch {
      /* ignore */
    }
  };
  const install = () => {
    if (!bip) return;
    bip.prompt();
    bip.userChoice.finally(dismiss);
  };

  return (
    <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-[120] border-y border-emerald-200 bg-white p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.12)]">
      <div className="mx-auto flex max-w-[760px] items-center gap-3">
        <div className="flex-1 text-sm text-slate-700">
          {ios ? (
            <>
              📲 Thêm <b>Minh Tuyết</b> vào Màn hình chính để dùng như app (toàn màn hình, mở nhanh): bấm nút{" "}
              <b>Chia sẻ</b> <span className="font-bold">⬆️</span> ở dưới → <b>Thêm vào MH chính</b>.
            </>
          ) : (
            <>
              📲 Cài <b>Minh Tuyết</b> thành ứng dụng để mở nhanh, dùng như app.
            </>
          )}
        </div>
        {!ios && bip && (
          <button onClick={install} className="shrink-0 rounded-xl bg-brand px-4 py-2 font-extrabold text-white">
            Cài app
          </button>
        )}
        <button onClick={dismiss} aria-label="Đóng" className="shrink-0 rounded-lg px-2 py-2 text-slate-400">
          ✕
        </button>
      </div>
    </div>
  );
}
