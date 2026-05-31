import { CustomerLedger } from "@/components/owner/Debt";
export default async function Page({ params }: { params: Promise<{ customer: string }> }) {
  const { customer } = await params;
  return <CustomerLedger customer={decodeURIComponent(customer)} />;
}
