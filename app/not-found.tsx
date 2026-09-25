import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <p className="font-display text-sm tracking-[0.3em] text-brand-red">404</p>
      <h1 className="mt-2 max-w-xl font-display text-5xl uppercase leading-none text-brand-red pop-shadow sm:text-6xl">
        That page is not on the floor
      </h1>
      <p className="mt-4 max-w-lg font-comic text-lg font-bold">
        Old Shopify links no longer work. The live auction and Buy Now desks are here.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/live" className="comic-btn">
          Live lots
        </Link>
        <Link href="/buy-now" className="comic-btn-invert">
          Buy Now
        </Link>
        <Link href="/" className="comic-btn-invert">
          Home
        </Link>
      </div>
    </main>
  );
}
