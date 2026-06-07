"use client";

import { useEffect } from "react";

/**
 * Keeps a CSS var `--kb-inset` = the on-screen keyboard's height (0 when closed), via the
 * visualViewport API. Bottom sheets reserve it (`pb-[var(--kb-inset,0px)]` on their items-end overlay)
 * so a focused input is lifted ABOVE the soft keyboard instead of hiding behind it — the owner hit this
 * on the Đóng-ca / Nộp-rút-quỹ sheets where autofocus popped the keyboard over the amount field.
 * Mounted once in the POS layout.
 */
export function KeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const set = () => {
      // Layout viewport height − visible (un-covered) height = keyboard height. offsetTop guards the
      // case where the page itself scrolled under the keyboard.
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb-inset", `${Math.round(kb)}px`);
    };
    vv.addEventListener("resize", set);
    vv.addEventListener("scroll", set);
    set();
    return () => {
      vv.removeEventListener("resize", set);
      vv.removeEventListener("scroll", set);
      document.documentElement.style.removeProperty("--kb-inset");
    };
  }, []);
  return null;
}
