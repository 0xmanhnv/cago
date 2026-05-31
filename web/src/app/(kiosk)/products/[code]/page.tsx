import { ProductDetail } from "@/components/kiosk/ProductDetail";

export default async function ProductDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ProductDetail code={decodeURIComponent(code)} />;
}
