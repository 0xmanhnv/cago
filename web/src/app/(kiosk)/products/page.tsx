import { Suspense } from "react";
import { ProductList } from "@/components/kiosk/ProductList";

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="py-8 text-center text-slate-500">Đang tải...</div>}>
      <ProductList />
    </Suspense>
  );
}
