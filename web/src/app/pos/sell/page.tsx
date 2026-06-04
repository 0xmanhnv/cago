import { Suspense } from "react";
import { Checkout } from "@/components/staff/Checkout";

import { PageLoading } from "@/components/ui/Loading";
export default function Page() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Checkout />
    </Suspense>
  );
}
