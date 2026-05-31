"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasRole, useSession } from "@/lib/session";

export { ROLE_SETS } from "@/lib/roles";

export function RoleGuard({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { boot, loading } = useSession();
  const router = useRouter();
  const ok = hasRole(boot, ...roles);

  useEffect(() => {
    if (!loading && !ok) router.replace("/login");
  }, [loading, ok, router]);

  if (loading) return <div className="p-8 text-center text-slate-500">Đang tải...</div>;
  if (!ok) return <div className="p-8 text-center text-slate-500">Đang chuyển hướng…</div>;
  return <>{children}</>;
}
