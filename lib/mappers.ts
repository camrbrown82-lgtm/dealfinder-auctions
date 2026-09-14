import { listingGradeFromSources } from "@/lib/listingGrade";
import { uniqueImageUrls, type AuctionLot, type Consignment, type LotCategory, type LotStatus } from "@/lib/utils";

export type LotRow = {
  id: string;
  slug: string | null;
  title: string;
  category: LotCategory;
  description: string;
  consignor_name: string;
  image_url: string;
  image_urls?: string[] | null;
  current_bid: number | string;
  min_increment: number | string;
  ends_at: string;
  status: LotStatus;
  high_bidder?: string | null;
  high_bidder_id?: string | null;
  event_id?: string | null;
  lot_number?: string | null;
  starting_bid?: number | string | null;
  reserve_price?: number | string | null;
  buy_now_price?: number | string | null;
  listing_grade?: string | null;
  item_details?: string | null;
};

export type ConsignmentRow = {
  id: string;
  consignor_name: string;
  title: string;
  category: LotCategory;
  condition: string | null;
  listing_grade?: string | null;
  description: string | null;
  notes: string | null;
  estimated_low: number | string | null;
  estimated_high: number | string | null;
  reserve_price?: number | string | null;
  buy_now_price?: number | string | null;
  starting_bid?: number | string | null;
  commission_rate?: number | string | null;
  image_urls: string[] | null;
  status: Consignment["status"];
};

export function mapLot(row: LotRow): AuctionLot {
  const images = uniqueImageUrls([...(row.image_urls ?? []), row.image_url]);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    image: images[0] || row.image_url,
    images,
    currentBid: Number(row.current_bid),
    minIncrement: Number(row.min_increment),
    endsAt: row.ends_at,
    consignor: row.consignor_name,
    description: row.description,
    status: row.status,
    highBidder: row.high_bidder ?? null,
    highBidderId: row.high_bidder_id ?? null,
    startingBid: Number(row.starting_bid ?? row.current_bid),
    reservePrice: Number(row.buy_now_price ?? row.reserve_price ?? 0) || null,
    buyNowPrice: Number(row.buy_now_price ?? row.reserve_price ?? 0) || null,
    eventId: row.event_id ?? null,
    lotNumber: row.lot_number ?? null,
    listingGrade: listingGradeFromSources(row.listing_grade, row.description),
    itemDetails: row.item_details ?? null,
  };
}

export function mapConsignment(row: ConsignmentRow): Consignment {
  return {
    id: row.id,
    consignor: row.consignor_name,
    title: row.title,
    category: row.category,
    condition: row.condition,
    listingGrade: listingGradeFromSources(row.listing_grade ?? row.condition, row.description),
    description: row.description,
    notes: row.notes,
    estimatedLow: row.estimated_low === null ? null : Number(row.estimated_low),
    estimatedHigh: row.estimated_high === null ? null : Number(row.estimated_high),
    reservePrice: Number(row.buy_now_price ?? row.reserve_price ?? 0) || null,
    buyNowPrice: Number(row.buy_now_price ?? row.reserve_price ?? 0) || null,
    startingBid: row.starting_bid == null ? null : Number(row.starting_bid),
    commissionRate: row.commission_rate == null ? null : Number(row.commission_rate),
    imageUrls: row.image_urls ?? [],
    status: row.status,
  };
}
