import Image from "next/image";
import Link from "next/link";
import { LiveGrid } from "@/components/LiveGrid";
import { fetchLiveLots } from "@/lib/lots";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const lots = await fetchLiveLots();

  return (
    <div className="text-brand-black">
      <section className="mx-auto max-w-6xl py-12 text-center">
        <div className="mx-auto inline-block border-4 border-black bg-black shadow-[4px_4px_0px_#000]">
          <Image
            src="/logo.webp"
            alt=""
            width={420}
            height={420}
            className="h-40 w-40 object-contain sm:h-52 sm:w-52"
            priority
          />
        </div>
        <h1 className="sr-only">DealFinder Auctions</h1>
        <p className="mt-4 text-xl font-bold">
          High-Speed Timed Liquidations & Local Consignments
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/consignor"
            className="border-4 border-black bg-brand-red px-6 py-3 font-extrabold text-white shadow-[4px_4px_0px_#000] hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
          >
            Sell / Consign Item
          </Link>
          <Link
            href="/admin"
            className="border-4 border-black bg-white px-6 py-3 font-extrabold text-black shadow-[4px_4px_0px_#000] hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
          >
            Admin Portal
          </Link>
        </div>
      </section>

      <LiveGrid lots={lots} />
    </div>
  );
}
