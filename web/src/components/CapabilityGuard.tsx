"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { hasCap, isAdmin, isInternal, isOwner, type Cap } from "@/lib/caps";
import { PageLoading } from "@/components/ui/Loading";

/**
 * Gate a /pos screen. With no `cap`/`owner`/`admin`, allows any back-of-house user (the shell).
 * `admin` requires the technical tier; `owner` the business super-role; `cap` a capability. UX only
 * — the server re-checks every API. A signed-in user who lacks access is sent back to /pos (not
 * /login) so they land on their own home rather than a dead end.
 */
export function CapabilityGuard({
  cap,
  owner,
  admin,
  children,
}: {
  cap?: Cap;
  owner?: boolean;
  admin?: boolean;
  children: React.ReactNode;
}) {
  const { boot, loading } = useSession();
  const router = useRouter();
  const signedIn = isInternal(boot);
  const allowed = admin ? isAdmin(boot) : owner ? isOwner(boot) : cap ? hasCap(boot, cap) : signedIn;

  useEffect(() => {
    if (loading) return;
    if (!signedIn) router.replace("/login");
    else if (!allowed) router.replace("/pos");
  }, [loading, signedIn, allowed, router]);

  if (loading) return <PageLoading />;
  if (!allowed) return <PageLoading label="Đang chuyển hướng…" />;
  return <>{children}</>;
}
