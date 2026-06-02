"use client";

import { Assistant } from "@/components/kiosk/Assistant";
import { useKiosk } from "@/store/kiosk";
import { useKioskNav } from "@/lib/kioskNav";

export default function AssistantPage() {
  const nav = useKioskNav();
  const kiosk = useKiosk();
  // "‹ Quay lại" returns to the page the customer opened the assistant from (product/list/home);
  // "Xong/Khách mới" still resets to home. goBack falls back to home on a fresh deep-link.
  return (
    <Assistant
      onClose={nav.goHome}
      onBack={() => nav.goBack(nav.goHome)}
      onOpenProduct={nav.openDetail}
      onCallStaff={kiosk.openCallStaff}
    />
  );
}
