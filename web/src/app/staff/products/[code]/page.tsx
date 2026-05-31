import { StaffProductDetail } from "@/components/staff/StaffProductDetail";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <StaffProductDetail code={decodeURIComponent(code)} />;
}
