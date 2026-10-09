import { createHash } from "node:crypto";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabaseClient";

export type ScrapedProduct = {
  sku?: string | null;
  imageUrls: string[];
  itemDetails: string;
  listingGrade: string;
};

/** A supplied SKU wins. Otherwise the photos and notes are the identity, so the same item is not cataloged twice. */
export function listingSku(item: ScrapedProduct) {
  const given = String(item.sku ?? "").trim();
  if (given) return given.slice(0, 200);
  const hash = createHash("sha256");
  hash.update(item.listingGrade);
  hash.update("\n");
  hash.update(item.itemDetails);
  for (const url of item.imageUrls) hash.update(`\n${url}`);
  return `photo-${hash.digest("hex")}`;
}

function missingTable(message: string) {
  return /product_listings|schema cache|does not exist/i.test(message);
}

export async function findGeneratedListing(sku: string) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase || !sku) return null;
  const { data, error } = await supabase
    .from("product_listings")
    .select("generated_listing")
    .eq("sku", sku)
    .maybeSingle();
  if (error) {
    if (!missingTable(error.message)) console.error("product_listings", error.message);
    return null;
  }
  const listing = data?.generated_listing;
  if (!listing || typeof listing !== "object" || Array.isArray(listing)) return null;
  return listing as Record<string, unknown>;
}

export async function saveGeneratedListing(sku: string, raw: ScrapedProduct, listing: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  if (!isSupabaseConfigured || !supabase || !sku) return;
  const { error } = await supabase.from("product_listings").insert({
    sku,
    raw_data: {
      sku: raw.sku ?? "",
      itemDetails: raw.itemDetails,
      listingGrade: raw.listingGrade,
      imageCount: raw.imageUrls.length,
    },
    generated_listing: listing,
  });
  if (error && !/duplicate|unique/i.test(error.message) && !missingTable(error.message)) {
    console.error("product_listings", error.message);
  }
}
