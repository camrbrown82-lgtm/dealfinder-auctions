import type { AuctionLot } from "@/lib/utils";
import { lotImages } from "@/lib/utils";
import { isListedBuyNow } from "@/lib/saleChannel";
import { listingGradeOf } from "@/lib/listingGrade";
import { getAdminDemo } from "@/lib/demoAdminStore";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";
import { mapLot, type LotRow } from "@/lib/mappers";
import { ebayConfigured, ebayCurrency, ebayMarketplaceId, EBAY_LOCATION_KEY } from "@/lib/ebay/config";
import {
  createOrUpdateOffer,
  ensureMerchantLocation,
  escapeEbayHtml,
  publishOffer,
  putInventoryItem,
  sellerSession,
  suggestEbayCategory,
} from "@/lib/ebay/sell";

export type EbayListResult = {
  mock: boolean;
  sku: string;
  offerId: string;
  listingId: string;
  listingUrl: string;
  message: string;
};

function skuFor(lot: AuctionLot) {
  const raw = (lot.lotNumber || lot.id).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `DF-${raw}`.slice(0, 50);
}

function publicPhotos(lot: AuctionLot) {
  return lotImages(lot).filter((url) => /^https?:\/\//i.test(url) && !url.startsWith("data:"));
}

function ebayCondition(lot: AuctionLot) {
  const grade = listingGradeOf(lot);
  if (grade === "New") return "NEW";
  if (grade === "Issues") return "USED_ACCEPTABLE";
  return "USED_GOOD";
}

function listingPrice(lot: AuctionLot) {
  const buyNow = Number(lot.buyNowPrice || lot.reservePrice || 0);
  if (buyNow > 0) return buyNow;
  return Number(lot.startingBid || lot.currentBid || 0);
}

function listingUrlFor(listingId: string) {
  if (!listingId) return "";
  const host = ebayMarketplaceId() === "EBAY_US" ? "https://www.ebay.com" : "https://www.ebay.ca";
  return `${host}/itm/${listingId}`;
}

async function loadLot(lotId: string): Promise<AuctionLot | null> {
  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data } = await supabase.from("lots").select("*").eq("id", lotId).maybeSingle();
      if (data) return mapLot(data as LotRow);
    }
  }
  return getAdminDemo().inventory.find((lot) => lot.id === lotId) ?? null;
}

async function stampLot(lot: AuctionLot, result: EbayListResult) {
  lot.ebaySku = result.sku;
  lot.ebayOfferId = result.offerId;
  lot.ebayListingId = result.listingId;
  lot.ebayListingUrl = result.listingUrl;
  lot.ebayListedAt = new Date().toISOString();
  if (!isSupabaseConfigured) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const patch: Record<string, unknown> = {
    ebay_sku: result.sku,
    ebay_offer_id: result.offerId,
    ebay_listing_id: result.listingId,
    ebay_listing_url: result.listingUrl,
    ebay_listed_at: lot.ebayListedAt,
  };
  let { error } = await supabase.from("lots").update(patch).eq("id", lot.id);
  if (error && /ebay_/i.test(error.message)) {
    ({ error } = await supabase
      .from("lots")
      .update({
        ebay_listing_id: result.listingId,
        ebay_listing_url: result.listingUrl,
      })
      .eq("id", lot.id));
  }
  if (error) console.error("stampLot ebay", error.message);
}

function mockList(lot: AuctionLot): EbayListResult {
  const sku = skuFor(lot);
  const listingId = `mock-${sku.toLowerCase()}`;
  return {
    mock: true,
    sku,
    offerId: `offer-${listingId}`,
    listingId,
    listingUrl: `https://www.ebay.ca/itm/${listingId}`,
    message:
      "Recorded a local eBay listing ticket. Add EBAY_CLIENT_ID / EBAY_CLIENT_SECRET, then Connect eBay once to publish for real.",
  };
}

export async function listLotOnEbay(lotId: string): Promise<EbayListResult> {
  const lot = await loadLot(lotId);
  if (!lot) throw new Error("That lot is not in inventory.");
  if (lot.status === "removed") throw new Error("Removed lots cannot be listed on eBay.");
  if (lot.paidAt) throw new Error("This lot already sold on DealFinder. Do not cross-post it.");
  if (!isListedBuyNow(lot)) {
    throw new Error("eBay listing is a Buy Now option. Give the item a Buy Now price, then list it from the Buy Now desk.");
  }

  const photos = publicPhotos(lot);
  const price = listingPrice(lot);
  if (price <= 0) throw new Error("Set a Buy Now or starting price before listing on eBay.");
  if (photos.length === 0) throw new Error("eBay needs at least one public https photo on the lot.");

  if (!ebayConfigured()) {
    const result = mockList(lot);
    await stampLot(lot, result);
    return result;
  }

  const session = await sellerSession();
  if (!session) {
    const error = new Error("Connect eBay once on the Buy Now admin page, then list without signing in again.");
    (error as Error & { code?: string }).code = "needs_connect";
    throw error;
  }

  const { token, connection } = session;
  if (!connection.fulfillmentPolicyId || !connection.paymentPolicyId || !connection.returnPolicyId) {
    throw new Error(
      "eBay is connected, but this seller account still needs payment, return, and shipping policies in Seller Hub. Create them once, then press List on eBay again.",
    );
  }

  const sku = skuFor(lot);
  const title = lot.title.trim().slice(0, 80);
  const description = `<p>${escapeEbayHtml(lot.description || title)}</p><p>Listed by DealFinder Auctions, Airdrie AB. Pickup at 529 Gateway Rd NE unless the eBay listing says otherwise.</p>`;
  await ensureMerchantLocation(token);
  const categoryId = await suggestEbayCategory(token, title);
  await putInventoryItem(token, sku, {
    availability: { shipToLocationAvailability: { quantity: 1 } },
    condition: ebayCondition(lot),
    product: {
      title,
      description,
      imageUrls: photos.slice(0, 12),
    },
  });

  const money = { value: price.toFixed(2), currency: ebayCurrency() };
  const offerBody: Record<string, unknown> = {
    sku,
    marketplaceId: connection.marketplaceId || ebayMarketplaceId(),
    format: "FIXED_PRICE",
    availableQuantity: 1,
    categoryId,
    listingDescription: description,
    merchantLocationKey: connection.merchantLocationKey || EBAY_LOCATION_KEY,
    listingPolicies: {
      fulfillmentPolicyId: connection.fulfillmentPolicyId,
      paymentPolicyId: connection.paymentPolicyId,
      returnPolicyId: connection.returnPolicyId,
    },
    pricingSummary: { price: money },
  };

  const offerId = await createOrUpdateOffer(token, lot.ebayOfferId ?? null, offerBody);
  const published = await publishOffer(token, offerId);
  const result: EbayListResult = {
    mock: false,
    sku,
    offerId: published.offerId || offerId,
    listingId: published.listingId,
    listingUrl: listingUrlFor(published.listingId),
    message: `Listed on eBay as ${published.listingId}. Later listings reuse this same eBay login.`,
  };
  await stampLot(lot, result);
  return result;
}
