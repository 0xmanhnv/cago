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

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const b = await frappeCall<Bootstrap>("cago.api.session.bootstrap", {}, { method: "GET" });
      setCsrfToken(b.csrf_token);
      setBoot(b);
      return b;
    } catch {
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
