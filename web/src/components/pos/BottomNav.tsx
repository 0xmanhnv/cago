"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { hasCap, isInternal, type Cap } from "@/lib/caps";

// A persistent bottom tab bar (native-app navigation) for the quick-access sections. "Trang chủ" is the
// full feature hub (the home grid = the other app's "Kho ứng dụng"); the rest are one-tap shortcuts.
// Cap-gated so staff only see what they can open. Hidden on screens that own the bottom edge themselves
// (the sell screen has its slide-up pay sheet) so two bottom bars never stack.
type Tab = { href: string; label: string; icon: string; cap?: Cap; active: (p: string) => boolean };

const TABS: Tab[] = [
  { href: "/pos", label: "Trang chủ", icon: "🏠", active: (p) => p === "/pos" },
  { href: "/pos/sell", label: "Bán hàng", icon: "🛒", cap: "sell", active: (p) => p.startsWith("/pos/sell") },
  { href: "/pos/debt", label: "Sổ nợ", icon: "📒", cap: "debt_view", active: (p) => p.startsWith("/pos/debt") || p.startsWith("/pos/record-") },
  {
    href: "/pos/products",
    label: "Sản phẩm",
    icon: "📦",
    cap: "products",
    active: (p) => p.startsWith("/pos/products") || p.startsWith("/pos/price") || p.startsWith("/pos/edit"),
  },
  { href: "/pos/reports", label: "Báo cáo", icon: "📊", cap: "reports", active: (p) => p.startsWith("/pos/reports") },
];

// Routes with their own fixed bottom bar → hide the global tab bar there.
const HIDE_PREFIXES = ["/pos/sell"];

export function BottomNav() {
  const path = usePathname() || "";
  const router = useRouter();
  const { boot } = useSession();
  // Facebook-style: hide the bar while scrolling DOWN (more list visible), slide it back the instant
  // the user scrolls UP (or near the top). Direction-based, rAF-throttled, transform-only (smooth).
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY.current;
        // Wider deadzone (±8) so small jitter/inertia doesn't flip-flop the bar; always shown near top.
        if (y < 60) setHidden(false);
        else if (dy > 8) setHidden(true);
        else if (dy < -8) setHidden(false);
        lastY.current = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!isInternal(boot)) return null;
  if (HIDE_PREFIXES.some((r) => path.startsWith(r))) return null;
  const tabs = TABS.filter((t) => !t.cap || hasCap(boot, t.cap));
  if (tabs.length < 2) return null; // nothing meaningful to switch between
  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-40 flex border-t border-emerald-100 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.07)] transition-transform duration-300 ease-out ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
    >
      {tabs.map((t) => {
        const on = t.active(path);
        return (
          <button
            key={t.href}
            onClick={() => router.push(t.href)}
            aria-current={on ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] font-bold transition-colors active:bg-emerald-50 ${
              on ? "text-brand" : "text-slate-400"
            }`}
          >
            <span className={`text-2xl leading-none ${on ? "" : "opacity-70 grayscale"}`}>{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
