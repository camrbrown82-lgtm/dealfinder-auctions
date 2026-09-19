import { BuyNowStore } from "@/components/BuyNowStore";
import { fetchBuyNowLots } from "@/lib/lots";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default async function BuyNowPage() {
  const lots = await fetchBuyNowLots();
  return <BuyNowStore lots={lots} />;
}
