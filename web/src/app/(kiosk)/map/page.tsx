import { Suspense } from "react";
import { MapPage } from "@/components/kiosk/MapPage";

export default function Page() {
  return (
    <Suspense fallback={<div className="py-8 text-center text-slate-400">Đang tải sơ đồ...</div>}>
      <MapPage />
    </Suspense>
  );
}
