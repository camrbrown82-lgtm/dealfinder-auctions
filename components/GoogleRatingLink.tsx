import { SITE } from "@/lib/site";

function Star() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden>
      <path d="M12 2.4 14.7 8l6.1.9-4.4 4.3 1 6.1L12 16.3 6.6 19.3l1-6.1L3.2 8.9 9.3 8 12 2.4Z" />
    </svg>
  );
}

export function GoogleRatingLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={SITE.googleReviewUrl || SITE.mapsUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Leave a Google review for DealFinder Auctions"
      className={`inline-flex max-w-full flex-wrap items-center gap-3 border-4 border-black bg-brand-cream px-4 py-3 text-left text-brand-ink shadow-comic transition hover:-translate-y-0.5 hover:bg-white ${className}`}
    >
      <span className="flex items-center gap-0.5" aria-hidden>
        <Star />
        <Star />
        <Star />
        <Star />
        <Star />
      </span>
      <span>
        <span className="block font-display text-xl leading-none text-brand-ink">Google rating</span>
        <span className="mt-1 block font-comic text-sm font-bold">Leave a Google review</span>
      </span>
    </a>
  );
}
