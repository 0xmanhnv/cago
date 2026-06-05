"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useKiosk } from "@/store/kiosk";

// The assistant is now a floating overlay (opened via the 🤖 button), not a standalone screen.
// Keep this route for old links / back-navigation: open the overlay and land on home behind it.
export default function AssistantPage() {
  const router = useRouter();
  const kiosk = useKiosk();
  useEffect(() => {
    kiosk.ensureFreshSession();
    kiosk.openAssistant();
    router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
