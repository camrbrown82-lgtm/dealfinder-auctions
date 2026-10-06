export async function loadSettings() {
  return chrome.storage.local.get(["supabaseUrl", "supabaseAnonKey", "profileLabel"]);
}

export function settingsReady(settings) {
  return Boolean(settings.supabaseUrl && settings.supabaseAnonKey && String(settings.profileLabel || "").trim());
}

export async function supabaseGet(path) {
  const settings = await loadSettings();
  const root = String(settings.supabaseUrl || "").replace(/\/$/, "");
  const key = String(settings.supabaseAnonKey || "").trim();
  if (!root || !key) throw new Error("Connect Supabase in the extension options.");
  const response = await fetch(`${root}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && (body.message || body.error || body.hint);
    throw new Error(message || `Supabase returned ${response.status}.`);
  }
  return body;
}

export function isListedBuyNow(row) {
  const status = row.buy_now_status;
  if (status === "sold" || status === "pending_approval") return false;
  if (row.status === "removed" || row.status === "draft") return false;
  if (row.paid_at) return false;
  const won = Boolean(row.high_bidder || row.high_bidder_id);
  if (row.status === "ended" && won) return false;
  const price = Number(row.buy_now_price ?? row.reserve_price ?? 0);
  return status === "listed" || row.sale_channel === "buy_now" || (Number.isFinite(price) && price > 0);
}

export function listingImages(row) {
  const list = Array.isArray(row.image_urls) ? row.image_urls : [];
  const urls = [...list, row.image_url]
    .map((value) => String(value || "").trim())
    .filter((url) => /^https?:\/\//i.test(url) && !url.includes("photo-1513885535751"));
  return [...new Set(urls)].slice(0, 10);
}

const PICKUP =
  "Pickup in Airdrie at 529 Gateway Rd NE. The price is the Buy Now amount. Pickup invoices add a 15% buyer's premium and 5% GST.";

export function listingJob(row) {
  const price = Number(row.buy_now_price ?? row.reserve_price ?? 0);
  const description = String(row.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const slug = row.slug || row.id;
  const pageUrl = `https://www.dealfinderauctions.com/auctions/${encodeURIComponent(slug)}`;
  return {
    kind: "listing",
    platform: "marketplace",
    title: String(row.title || "DealFinder lot").slice(0, 200),
    text: `${description} ${PICKUP} ${pageUrl}`.trim().slice(0, 5000),
    price: Number.isFinite(price) && price > 0 ? price.toFixed(2) : "",
    condition: row.listing_grade === "New" ? "new" : "used",
    category: row.category || "",
    imageUrls: listingImages(row),
  };
}

export function clipCaption(title) {
  return `New at DealFinder Auctions: ${title}. See it at https://www.dealfinderauctions.com/media`;
}

export function clipPost(platform, row) {
  return {
    kind: "clip",
    platform,
    title: String(row.title || "New item"),
    text: clipCaption(row.title || "New item"),
    videoUrl: row.public_url,
  };
}
