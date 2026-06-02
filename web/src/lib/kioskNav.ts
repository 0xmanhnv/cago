"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useKiosk } from "@/store/kiosk";

// Marker: did the customer navigate WITHIN the kiosk this session? If so, "Quay lại" can safely
// pop history (returns to wherever they actually came from — map, a list, the assistant…). On a
// fresh/deep-linked screen there's no in-app history, so back uses an explicit fallback instead
// of dropping out of the app.
const mark = () => {
  try {
    sessionStorage.setItem("cago_nav", "1");
  } catch {
    /* ignore */
  }
};
const canPop = () => {
  try {
    return sessionStorage.getItem("cago_nav") === "1" && window.history.length > 1;
  } catch {
    return false;
  }
};

/** Path-based navigation for the kiosk (resources as paths, filters as query params). */
export function useKioskNav() {
  const router = useRouter();
  const kiosk = useKiosk();

  const goHome = useCallback(() => router.push("/"), [router]);

  const openList = useCallback(
    (category?: string, query?: string) => {
      mark();
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
      mark();
      router.push(`/products/${encodeURIComponent(code)}`);
    },
    [router],
  );

  const openCart = useCallback(() => {
    mark();
    router.push("/cart");
  }, [router]);

  const openChat = useCallback(() => {
    mark();
    kiosk.ensureFreshSession();
    router.push("/assistant");
  }, [kiosk, router]);

  const openMyDebt = useCallback(() => {
    mark();
    router.push("/my-debt");
  }, [router]);

  const openMap = useCallback(() => {
    mark();
    router.push("/map");
  }, [router]);

  // Return to the previous in-app screen; fall back to `fallback` (default home) on a fresh entry.
  const goBack = useCallback(
    (fallback?: () => void) => {
      if (canPop()) router.back();
      else if (fallback) fallback();
      else router.push("/");
    },
    [router],
  );

  return { goHome, openList, openDetail, openCart, openChat, openMyDebt, openMap, goBack };
}
