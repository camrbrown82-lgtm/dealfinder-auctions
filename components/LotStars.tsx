import { listingGradeOf, parseListingGrade, type ListingGrade } from "@/lib/listingGrade";

export function LotStars({
  rating,
  className = "",
}: {
  rating: ListingGrade | number | string | null | undefined;
  className?: string;
}) {
  const stars = Number(parseListingGrade(rating));
  return (
    <span role="img" aria-label={`${stars} out of 5 stars`} className={`inline-flex gap-0.5 leading-none ${className}`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} aria-hidden className={index < stars ? "text-brand-red" : "text-black/25"}>
          ★
        </span>
      ))}
    </span>
  );
}

export function LotStarsFromLot({
  lot,
  className,
}: {
  lot: { listingGrade?: string | null; description?: string | null };
  className?: string;
}) {
  return <LotStars rating={listingGradeOf(lot)} className={className} />;
}
