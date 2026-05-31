"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useKiosk } from "@/store/kiosk";

/** Path-based navigation for the kiosk (resources as paths, filters as query params). */
export function useKioskNav() {
  const router = useRouter();
  const kiosk = useKiosk();

  const goHome = useCallback(() => router.push("/"), [router]);

  const openList = useCallback(
    (category?: string, query?: string) => {
      const sp = new URLSearchParams();
      if (category) sp.set("category", category);
      if (query) sp.set("q", query);
      const s = sp.toString();
      router.push(s ? `/products?${s}` : "/products");
    },
    [router],
  );

  const openDetail = useCallback(
    (code: string) => router.push(`/products/${encodeURIComponent(code)}`),
    [router],
  );

  const openCart = useCallback(() => router.push("/cart"), [router]);

  const openChat = useCallback(() => {
    kiosk.ensureFreshSession();
    router.push("/assistant");
  }, [kiosk, router]);

  const openMyDebt = useCallback(() => router.push("/my-debt"), [router]);

  return { goHome, openList, openDetail, openCart, openChat, openMyDebt };
}
