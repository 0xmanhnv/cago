import { ProductEditor } from "@/components/owner/ProductEditor";
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ProductEditor code={decodeURIComponent(code)} />;
}
