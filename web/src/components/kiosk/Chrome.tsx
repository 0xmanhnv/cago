"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useKiosk } from "@/store/kiosk";
import { useKioskNav } from "@/lib/kioskNav";
import { useKioskLockdown } from "@/lib/useKioskLockdown";
import { HelpFab } from "./HelpFab";
import { Assistant } from "./Assistant";
import { CallStaff } from "./CallStaff";
import { applyKioskUrlFlag } from "./StoreMapView";

export function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const kiosk = useKiosk();
  const nav = useKioskNav();
  const cartCount = kiosk.cartCount();
  const [fixed, setFixed] = useState(false); // in-store fixed-kiosk device (cago_fixed_kiosk flag)
  const [isFs, setIsFs] = useState(false);
  const [fsOk, setFsOk] = useState(false); // Fullscreen API actually supported (false on iOS Safari)
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  // Load persisted cart/chat from sessionStorage AFTER mount (client-only) so the first render
  // matches the server HTML — see the note in store/kiosk.ts. Also read the fixed-kiosk flag +
  // track fullscreen (both are client-only, post-mount → hydration-safe).
  useEffect(() => {
    void import("@/lib/miniapp").then((m) => m.initMiniApp()); // Telegram/Zalo Mini App host polish (no-op on plain web)
    kiosk.hydrate();
    setFixed(applyKioskUrlFlag()); // ?kiosk=1/0 in the launch URL provisions the flag (OS-controlled)
    setFsOk(!!document.documentElement.requestFullscreen && document.fullscreenEnabled);
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    onFs();
    return () => document.removeEventListener("fullscreenchange", onFs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kiosk hardening (fixed device only): after a while idle, wipe the previous customer's cart/chat
  // and return home; also block context menu / selection / pinch-zoom. Phones are unaffected.
  const onIdle = useCallback(() => {
    const k = useKiosk.getState();
    k.clearCart();
    k.clearFocus();
    k.newSession();
    k.closeCallStaff();
    k.closeAssistant();
    if (pathRef.current !== "/") nav.goHome();
  }, [nav]);
  useKioskLockdown(fixed, onIdle);

  const showFabs = pathname !== "/"; // home has its own big buttons
  const showCartBar = cartCount > 0 && pathname !== "/cart" && !kiosk.assistantOpen;

  // 900px is right for a tablet; the in-store kiosk runs on a big screen, so widen on xl/2xl
  // (the grids add columns to fill it) instead of stranding content in a narrow centred column.
  return (
    <div className="mx-auto max-w-[900px] px-4 pb-24 pt-4 text-[#14271b] xl:max-w-[1320px] 2xl:max-w-[1600px]">
      {/* Fixed kiosk only: one-tap fullscreen (browsers require a user gesture, so it can't be
          auto). Hides the browser chrome — pairs with the OS-level lockdown. */}
      {fixed && fsOk && !isFs && (
        <button
          onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
          className="fixed left-2 top-2 z-[65] rounded-lg bg-black/30 px-2.5 py-1 text-xs font-bold text-white backdrop-blur"
        >
          ⛶ Toàn màn hình
        </button>
      )}
      <div key={pathname} className="animate-fade-in">
        {children}
      </div>

      {showCartBar && (
        <button
          onClick={nav.openCart}
          className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between bg-brand-dark px-5 py-3.5 text-lg font-extrabold text-white"
        >
          <span>🧺 Đã chọn: {cartCount} sản phẩm</span>
          <span>Xem &amp; gửi →</span>
        </button>
      )}

      {showFabs && (
        // One small corner control that expands into the labelled actions — doesn't cover content.
        <HelpFab onChat={nav.openChat} onCall={kiosk.openCallStaff} showChat={!kiosk.assistantOpen} />
      )}

      {kiosk.callStaffOpen && <CallStaff onDone={kiosk.closeCallStaff} />}

      {/* Assistant chat overlay — floating window on PC, full-screen on phone/tablet. */}
      {kiosk.assistantOpen && (
        <Assistant
          onClose={() => { kiosk.newSession(); kiosk.closeAssistant(); }}
          onBack={kiosk.closeAssistant}
          onOpenProduct={(code) => { kiosk.closeAssistant(); nav.openDetail(code); }}
          onOpenCategory={(cat) => { kiosk.closeAssistant(); nav.openList(cat); }}
          onCallStaff={kiosk.openCallStaff}
        />
      )}
    </div>
  );
}