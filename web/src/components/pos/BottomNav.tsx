"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { isInternal } from "@/lib/caps";
import { ACTIONS, canRunAction, readFavorites, tabParts } from "@/lib/posActions";

// Customisable bottom tab bar (iPhone/Facebook style) — "Trang chủ" is LOCKED first, the rest mirror the
// owner's pinned "⭐ Hay dùng" shortcuts (edited in one place, on the home "Sắp xếp"), capped + cap-gated.
// Nothing is ever lost: every function still lives in the home grid. Hides on /pos/sell (its own pay bar)
// and hides on scroll-down / returns on scroll-up.
type Tab = { href: string; icon: string; label: string; active: (p: string) => boolean };

const HOME: Tab = { href: "/pos", icon: "🏠", label: "Trang chủ", active: (p) => p === "/pos" };
const DEFAULT_KEYS = ["sell", "debt", "product", "reports"]; // shown until the owner pins their own
const HIDE_PREFIXES = ["/pos/sell"];
const MAX_FAV_TABS = 4;
// Product section siblings (the SectionTabs group) → keep the Sản phẩm tab lit across them.
const PRODUCT_GROUP = ["/pos/products", "/pos/price", "/pos/edit", "/pos/categories", "/pos/recommended", "/pos/labels", "/pos/health"];

function actionToTab(key: string): Tab | null {
  const a = ACTIONS[key];
  if (!a?.href) return null; // only navigable actions can be a tab
  const { icon, label } = tabParts(a.label);
  const href = a.href;
  const active =
    key === "product"
      ? (p: string) => PRODUCT_GROUP.some((r) => p.startsWith(r))
      : (p: string) => p === href || p.startsWith(href + "/") || p.startsWith(href + "?");
  return { href, icon, label, active };
}

export function BottomNav() {
  const path = usePathname() || "";
  const router = useRouter();
  const { boot } = useSession();
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const [tabs, setTabs] = useState<Tab[]>([HOME]);

  // Facebook-style hide on scroll-down / show on scroll-up (rAF-throttled, deadzone so it never jitters).
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY.current;
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

  // Build the tabs from pinned favourites — re-read on each navigation so edits on the home screen show
  // up here too. Cap-gated + de-duped + capped; falls back to sensible defaults if nothing is pinned.
  useEffect(() => {
    const pinned = readFavorites().map((f) => f.k);
    const keys = pinned.length ? pinned : DEFAULT_KEYS;
    const favTabs = keys
      .filter((k, i) => keys.indexOf(k) === i) // de-dup, keep order
      .filter((k) => ACTIONS[k]?.href && canRunAction(ACTIONS[k], boot))
      .slice(0, MAX_FAV_TABS)
      .map(actionToTab)
      .filter((t): t is Tab => !!t);
    setTabs([HOME, ...favTabs]);
  }, [path, boot]);

  if (!isInternal(boot)) return null;
  if (HIDE_PREFIXES.some((r) => path.startsWith(r))) return null;
  if (tabs.length < 2) return null;
  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-40 bg-[#ecf9ee] pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-out ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="flex border-t border-emerald-100 bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.07)]">
        {tabs.map((t) => {
          const on = t.active(path);
          return (
            <button
              key={t.href}
              onClick={() => router.push(t.href)}
              aria-current={on ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 px-0.5 py-1.5 text-[11px] font-bold transition-colors active:bg-emerald-50 ${
                on ? "text-brand" : "text-slate-400"
              }`}
            >
              <span className={`text-2xl leading-none ${on ? "" : "opacity-70 grayscale"}`}>{t.icon}</span>
              <span className="max-w-full truncate">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
