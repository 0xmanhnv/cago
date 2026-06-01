import { Suspense } from "react";
import { Checkout } from "@/components/staff/Checkout";

export default function Page() {
  return (
    <Suspense fallback={<div className="py-8 text-center text-slate-500">Đang tải...</div>}>
      <Checkout />
    </Suspense>
  );
}
