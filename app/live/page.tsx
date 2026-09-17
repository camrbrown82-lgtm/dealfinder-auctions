import { LiveGrid } from "@/components/LiveGrid";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LiveAuctionsPage() {
  return (
    <div className="min-w-0 text-brand-black">
      <section className="mx-auto max-w-6xl pb-6 text-center">
        <h1 className="sr-only">Live auctions</h1>
        <a href="/consignor" className="comic-btn">
          Sell / Consign Item
        </a>
      </section>

      <LiveGrid lots={[]} sales={[]} />
    </div>
  );
}
