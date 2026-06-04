import { ProductDetail } from "@/components/staff/ProductDetail";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ProductDetail code={decodeURIComponent(code)} />;
}
