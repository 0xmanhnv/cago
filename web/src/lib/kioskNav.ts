"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useKiosk } from "@/store/kiosk";

// How many in-app steps deep from the home screen the customer currently is. Used to decide
// whether "Quay lại" is redundant with "Trang chủ" (depth ≤ 1 → back IS home → show one button;
// depth ≥ 2 → show both). Self-heals to 0 whenever they reach home, so a stray phone gesture-back
// can't desync it for long.
const DEPTH = "cago_depth";
const NAV = "cago_nav";
const get = (k: string) => {
  try {
    return parseInt(sessionStorage.getItem(k) || "0", 10) || 0;
  } catch {
    return 0;
  }
};
const set = (k: string, v: string) => {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};
const bump = () => {
  set(NAV, "1");
  set(DEPTH, String(get(DEPTH) + 1));
};
export const navDepth = () => get(DEPTH);
export const resetKioskDepth = () => set(DEPTH, "0");
const canPop = () => {
  try {
    return sessionStorage.getItem(NAV) === "1" && window.history.length > 1;
  } catch {
    return false;
  }
};

/** Path-based navigation for the kiosk (resources as paths, filters as query params). */
export function useKioskNav() {
  const router = useRouter();
  const kiosk = useKiosk();

  const goHome = useCallback(() => {
    resetKioskDepth();
    router.push("/");
  }, [router]);

  const openList = useCallback(
    (category?: string, query?: string) => {
      bump();
      const sp = new URLSearchParams();
      if (category) sp.set("category", category);
      if (query) sp.set("q", query);
      const s = sp.toString();
      router.push(s ? `/products?${s}` : "/products");
    },
    [router],
  );

  const openDetail = useCallback(
    (code: string) => {
      bump();
      router.push(`/products/${encodeURIComponent(code)}`);
    },
    [router],
  );

  const openCart = useCallback(() => {
    bump();
    router.push("/cart");
  }, [router]);

  const openChat = useCallback(() => {
    bump();
    kiosk.ensureFreshSession();
    router.push("/assistant");
  }, [kiosk, router]);

  const openMyDebt = useCallback(() => {
    bump();
    router.push("/my-debt");
  }, [router]);

  const openMap = useCallback(() => {
    bump();
    router.push("/map");
  }, [router]);

  // Pop one screen; fall back to `fallback` (default home) on a fresh entry with no in-app history.
  const goBack = useCallback(
    (fallback?: () => void) => {
      set(DEPTH, String(Math.max(0, get(DEPTH) - 1)));
      if (canPop()) router.back();
      else if (fallback) fallback();
      else {
        resetKioskDepth();
        router.push("/");
      }
    },
    [router],
  );

  return { goHome, openList, openDetail, openCart, openChat, openMyDebt, openMap, goBack };
}
