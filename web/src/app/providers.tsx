"use client";

import { SessionProvider } from "@/lib/session";
import { DialogHost } from "@/components/ui/dialog";
import { ToastHost } from "@/components/ui/toast";

// All data fetching goes through lib/api.frappeCall — TanStack Query was installed but never used, so
// its provider + client were pure dead first-load JS on every route (incl. the kiosk). Removed.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SessionProvider>{children}</SessionProvider>
      <DialogHost />
      <ToastHost />
    </>
  );
}
