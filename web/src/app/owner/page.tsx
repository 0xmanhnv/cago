import { RoleGuard } from "@/components/RoleGuard";
import { ROLE_SETS } from "@/lib/roles";
import { OwnerApp } from "@/components/owner/OwnerApp";

export const dynamic = "force-dynamic";

export default function OwnerPage() {
  return (
    <RoleGuard roles={ROLE_SETS.owner}>
      <OwnerApp />
    </RoleGuard>
  );
}
