"use client";

import { Assistant } from "@/components/kiosk/Assistant";
import { useKiosk } from "@/store/kiosk";
import { useKioskNav } from "@/lib/kioskNav";

export default function AssistantPage() {
  const nav = useKioskNav();
  const kiosk = useKiosk();
  return <Assistant onClose={nav.goHome} onOpenProduct={nav.openDetail} onCallStaff={kiosk.openCallStaff} />;
}
