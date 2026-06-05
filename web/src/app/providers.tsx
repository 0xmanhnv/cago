"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { SessionProvider } from "@/lib/session";
import { DialogHost } from "@/components/ui/dialog";
import { ToastHost } from "@/components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <SessionProvider>{children}</SessionProvider>
      <DialogHost />
      <ToastHost />
    </QueryClientProvider>
  );
}
