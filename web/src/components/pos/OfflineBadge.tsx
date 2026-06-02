"use client";

// Floating status pill for the till: shows the network state + how many offline sales still need
// syncing, and quietly flushes the queue the moment the connection returns. Tap → the pending list.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useOnline } from "@/lib/offline/useOnline";
import { queueCounts } from "@/lib/offline/queue";
import { flushQueue } from "@/lib/offline/sync";
import { refreshCatalog } from "@/lib/offline/catalog";

export function OfflineBadge() {
  const online = useOnline();
  const [counts, setCounts] = useState({ pending: 0, failed: 0 });
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => {
    queueCounts().then(setCounts).catch(() => {});
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await flushQueue();
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    const onUp = () => {
      void refreshCatalog().catch(() => {});
      void sync();
    };
    window.addEventListener("cago:queuechange", onChange);
    window.addEventListener("cago:online", onUp);
    window.addEventListener("cago:offline", onChange);
    // If we loaded already-online with a backlog, drain it now.
    if (online) void sync();
    return () => {
      window.removeEventListener("cago:queuechange", onChange);
      window.removeEventListener("cago:online", onUp);
      window.removeEventListener("cago:offline", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { pending, failed } = counts;
  // Nothing worth showing: online, nothing queued, nothing stuck → stay out of the way.
  if (online && pending === 0 && failed === 0) return null;

  let cls = "bg-amber-500 text-white";
  let label = "Ngoại tuyến";
  if (online && syncing && pending > 0) {
    cls = "bg-sky-600 text-white";
    label = `Đang đồng bộ ${pending} đơn…`;
  } else if (online && pending > 0) {
    cls = "bg-sky-600 text-white";
    label = `${pending} đơn chờ đồng bộ`;
  } else if (!online) {
    label = pending > 0 ? `Ngoại tuyến · ${pending} đơn chờ` : "Ngoại tuyến";
  } else if (failed > 0) {
    cls = "bg-rose-600 text-white";
    label = `${failed} đơn lỗi`;
  }

  return (
    <Link
      href="/pos/pending"
      className={`fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-lg sm:left-4 sm:translate-x-0 ${cls}`}
    >
      <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white/90 ${!online ? "animate-pulse" : ""}`} />
      {label}
      {failed > 0 && <span className="rounded-full bg-white/25 px-1.5 text-xs">⚠ {failed}</span>}
    </Link>
  );
}
