import { RoleGuard } from "@/components/RoleGuard";
import { ROLE_SETS } from "@/lib/roles";
import { StaffApp } from "@/components/staff/StaffApp";

export const dynamic = "force-dynamic";

export default function StaffPage() {
  return (
    <RoleGuard roles={ROLE_SETS.staff}>
      <StaffApp />
    </RoleGuard>
  );
}
