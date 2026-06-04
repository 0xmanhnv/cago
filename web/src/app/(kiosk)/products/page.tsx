import { Suspense } from "react";
import { ProductList } from "@/components/kiosk/ProductList";

import { PageLoading } from "@/components/ui/Loading";
export default function ProductsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ProductList />
    </Suspense>
  );
}
