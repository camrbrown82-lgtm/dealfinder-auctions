import { listingGradeOf } from "@/lib/listingGrade";
import { absoluteUrl } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { isBuyNowChannel } from "@/lib/saleChannel";
import { isLotOpen, lotImages, type AuctionLot } from "@/lib/utils";

export interface AuctionItemProps {
  name: string;
  description: string;
  images: string[];
  sku: string;
  price: number;
  currency?: string;
  auctionEnd: string;
  itemUrl: string;
  condition?: "NewCondition" | "UsedCondition" | "RefurbishedCondition";
  availability?: "https://schema.org/InStock" | "https://schema.org/SoldOut";
}

export default function AuctionSchema({
  name,
  description,
  images,
  sku,
  price,
  currency = "CAD",
  auctionEnd,
  itemUrl,
  condition = "UsedCondition",
  availability = "https://schema.org/InStock",
}: AuctionItemProps) {
  const amount = Number.isFinite(price) ? price : 0;
  const schemaData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    image: images,
    description,
    sku,
    brand: {
      "@type": "Brand",
      name: SITE.name,
    },
    offers: {
      "@type": "Offer",
      url: itemUrl,
      priceCurrency: currency,
      price: amount.toFixed(2),
      priceValidUntil: auctionEnd,
      itemCondition: `https://schema.org/${condition}`,
      availability,
      seller: {
        "@type": "Organization",
        name: SITE.name,
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData).replace(/</g, "\\u003c") }}
    />
  );
}

function schemaCondition(lot: AuctionLot): AuctionItemProps["condition"] {
  return listingGradeOf(lot) === "5" ? "NewCondition" : "UsedCondition";
}

function schemaPrice(lot: AuctionLot) {
  if (isBuyNowChannel(lot)) {
    const listed = Number(lot.buyNowPrice);
    if (listed > 0) return listed;
  }
  if (lot.currentBid > 0) return lot.currentBid;
  const start = Number(lot.startingBid);
  return start > 0 ? start : 0;
}

function schemaAvailability(lot: AuctionLot): AuctionItemProps["availability"] {
  if (lot.status === "removed") return "https://schema.org/SoldOut";
  if (isBuyNowChannel(lot)) {
    if (lot.buyNowStatus === "sold" || lot.paidAt || lot.status === "ended") {
      return "https://schema.org/SoldOut";
    }
    return "https://schema.org/InStock";
  }
  return isLotOpen(lot) ? "https://schema.org/InStock" : "https://schema.org/SoldOut";
}

export function auctionSchemaFromLot(lot: AuctionLot): AuctionItemProps {
  const images = lotImages(lot).map((src) => (src.startsWith("http") ? src : absoluteUrl(src)));
  return {
    name: lot.title,
    description: lot.description.trim() || lot.title,
    images: images.length ? images : [absoluteUrl("/logo.png")],
    sku: lot.lotNumber?.trim() || lot.id,
    price: schemaPrice(lot),
    auctionEnd: lot.endsAt,
    itemUrl: absoluteUrl(`/auctions/${lot.slug || lot.id}`),
    condition: schemaCondition(lot),
    availability: schemaAvailability(lot),
  };
}
