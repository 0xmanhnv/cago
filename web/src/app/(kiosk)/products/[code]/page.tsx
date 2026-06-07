import { ProductDetail } from "@/components/kiosk/ProductDetail";

export default async function ProductDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // Next already decodes the dynamic param — decoding again throws (URIError) on codes containing "%".
  return <ProductDetail code={code} />;
}
