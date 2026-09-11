import { notFound } from "next/navigation";
import { AuctionRoom } from "@/components/auction-room";
import { getLot } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AuctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lot = await getLot(id);
  if (!lot) notFound();
  return <AuctionRoom lot={lot} />;
}
