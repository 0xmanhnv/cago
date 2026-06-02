"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { hasCap, isInternal, isOwner, type Cap } from "@/lib/caps";

/**
 * Gate a /pos screen. With no `cap`/`owner`, allows any back-of-house user (the shell). With a
 * `cap`, requires that capability; with `owner`, requires the owner super-role. UX only — the
 * server re-checks every API. A signed-in user who lacks the capability is sent back to /pos
 * (not /login) so they land on their own home rather than a dead end.
 */
export function CapabilityGuard({
  cap,
  owner,
  children,
}: {
  cap?: Cap;
  owner?: boolean;
  children: React.ReactNode;
}) {
  const { boot, loading } = useSession();
  const router = useRouter();
  const signedIn = isInternal(boot);
  const allowed = owner ? isOwner(boot) : cap ? hasCap(boot, cap) : signedIn;

  useEffect(() => {
    if (loading) return;
    if (!signedIn) router.replace("/login");
    else if (!allowed) router.replace("/pos");
  }, [loading, signedIn, allowed, router]);

  if (loading) return <div className="p-8 text-center text-slate-500">Đang tải...</div>;
  if (!allowed) return <div className="p-8 text-center text-slate-500">Đang chuyển hướng…</div>;
  return <>{children}</>;
}
