import { Suspense } from "react";
import { MapPage } from "@/components/kiosk/MapPage";

import { PageLoading } from "@/components/ui/Loading";
export default function Page() {
  return (
    <Suspense fallback={<PageLoading label="Đang tải sơ đồ..." />}>
      <MapPage />
    </Suspense>
  );
}
