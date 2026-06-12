"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { frappeCall, setCsrfToken } from "./api";
import type { Bootstrap } from "./types";

interface SessionValue {
  boot: Bootstrap | null;
  loading: boolean;
  reload: () => Promise<Bootstrap | null>;
}

const SessionCtx = createContext<SessionValue>({
  boot: null,
  loading: true,
  reload: async () => null,
});

// Last good signed-in bootstrap, used as an offline cold-start fallback (see reload). Cleared on logout.
export const BOOT_CACHE = "cago_boot_cache";
function readBootCache(): Bootstrap | null {
  try {
    const r = typeof window !== "undefined" ? window.localStorage?.getItem(BOOT_CACHE) : null;
    return r ? (JSON.parse(r) as Bootstrap) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const b = await frappeCall<Bootstrap>("cago.api.session.bootstrap", {}, { method: "GET" });
      setCsrfToken(b.csrf_token);
      setBoot(b);
      // Remember the last GOOD signed-in bootstrap so a cold start of the cached /pos/sell shell while
      // offline can render with the right caps instead of bouncing to /login (which needs the network).
      // Never cache a guest session as signed-in; logout() clears this key.
      try {
        if (b.is_guest) window.localStorage?.removeItem(BOOT_CACHE);
        else window.localStorage?.setItem(BOOT_CACHE, JSON.stringify(b));
      } catch {
        /* storage unavailable — ignore */
      }
      return b;
    } catch {
      // Bootstrap unreachable (offline): fall back to the last signed-in bootstrap if we have one, so
      // the offline sell screen stays usable. Its csrf_token is stale, but sync refreshes it on
      // reconnect; reads use the cached catalog/customers.
      const cached = readBootCache();
      if (cached) {
        setBoot(cached);
        return cached;
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <SessionCtx.Provider value={{ boot, loading, reload }}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  return useContext(SessionCtx);
}

export function hasRole(boot: Bootstrap | null, ...roles: string[]) {
  if (!boot) return false;
  return boot.roles.some((r) => roles.includes(r));
}
