"use client";

import { useRouter } from "next/navigation";
import { BackBar, goBackSmart } from "@/components/owner/Shared";
import { TelegramLink } from "@/components/pos/TelegramLink";

export default function Page() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-[760px]">
      <BackBar onBack={() => goBackSmart(router)} title="🔗 Liên kết Telegram" />
      <div className="mt-4">
        <TelegramLink />
      </div>
    </div>
  );
}
