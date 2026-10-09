import { buyNowPriceOf } from "@/lib/buyNow";
import { absoluteUrl as siteUrl } from "@/lib/seo";
import { catalogCondition, listingGradeOf } from "@/lib/listingGrade";
import { isBuyNowChannel, isListedBuyNow } from "@/lib/saleChannel";
import { lotImages, type AuctionLot } from "@/lib/utils";

const COLUMNS = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "link",
  "image_link",
  "additional_image_link",
  "brand",
  "quantity_to_sell_on_facebook",
] as const;

export function facebookCatalogCsv(lots: AuctionLot[]) {
  const lines = [COLUMNS.join(",")];
  for (const lot of lots) {
    const row = facebookCatalogRow(lot);
    if (!row) continue;
    lines.push(COLUMNS.map((column) => csvCell(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function facebookCatalogRow(lot: AuctionLot): Record<(typeof COLUMNS)[number], string> | null {
  if (!includeInCatalog(lot)) return null;
  const images = lotImages(lot).map(absoluteUrl).filter(isPublicHttp);
  const image = images[0];
  const price = buyNowPriceOf(lot);
  if (!image || !price) return null;
  const inStock = isListedBuyNow(lot);
  const grade = listingGradeOf(lot);
  const description = plainText(
    `${lot.description} Pickup in Airdrie at 529 Gateway Rd NE. The price is the Buy Now amount. Pickup invoices add a 15% buyer's premium and 5% GST.`,
  ).slice(0, 5000);
  return {
    id: lot.id,
    title: plainText(lot.title).slice(0, 200) || "DealFinder lot",
    description,
    availability: inStock ? "in stock" : "out of stock",
    condition: catalogCondition(grade),
    price: `${price.toFixed(2)} CAD`,
    link: siteUrl(`/auctions/${encodeURIComponent(lot.slug || lot.id)}`),
    image_link: image,
    additional_image_link: images.slice(1, 11).join(","),
    brand: "DealFinder Auctions",
    quantity_to_sell_on_facebook: inStock ? "1" : "0",
  };
}

function includeInCatalog(lot: AuctionLot) {
  if (!isBuyNowChannel(lot) && !isListedBuyNow(lot)) return false;
  if (lot.status === "removed" || lot.status === "draft") return false;
  if (lot.buyNowStatus === "pending_approval") return false;
  if (isListedBuyNow(lot)) return true;
  return lot.buyNowStatus === "sold" || Boolean(lot.paidAt) || lot.status === "ended";
}

function absoluteUrl(url: string) {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (!trimmed.startsWith("/")) return "";
  return siteUrl(trimmed);
}

function isPublicHttp(url: string) {
  return /^https?:\/\//i.test(url);
}

function plainText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
