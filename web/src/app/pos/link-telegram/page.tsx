"use client";

import { useRouter } from "next/navigation";
import { BackBar, goBackSmart } from "@/components/owner/Shared";
import { SocialLinks } from "@/components/pos/SocialLinks";

export default function Page() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-[760px]">
      <BackBar onBack={() => goBackSmart(router)} title="🔗 Liên kết mạng xã hội" />
      <div className="mt-4">
        <SocialLinks />
      </div>
    </div>
  );
}
