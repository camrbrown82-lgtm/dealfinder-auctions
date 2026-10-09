import { SITE } from "@/lib/site";
import { EBAY_LOCATION_KEY, ebayApiHost, ebayMarketplaceId } from "@/lib/ebay/config";
import { liveEbayAccessToken, writeEbayConnection, type EbayConnection } from "@/lib/ebay/store";

type EbayJson = Record<string, unknown>;

async function sellFetch(path: string, init: RequestInit & { token: string }) {
  const { token, ...rest } = init;
  const response = await fetch(`${ebayApiHost()}${path}`, {
    ...rest,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "content-language": "en-CA",
      "accept-language": "en-CA",
      ...(rest.headers ?? {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let json: EbayJson = {};
  if (text) {
    try {
      json = JSON.parse(text) as EbayJson;
    } catch {
      json = { message: text.slice(0, 400) };
    }
  }
  return { ok: response.ok, status: response.status, json };
}

function firstPolicyId(json: EbayJson, key: string) {
  const list = json[key];
  if (!Array.isArray(list) || list.length === 0) return null;
  const row = list[0] as Record<string, unknown>;
  return String(row.fulfillmentPolicyId || row.paymentPolicyId || row.returnPolicyId || "") || null;
}

export async function hydrateSellerPolicies(connection: EbayConnection, token: string) {
  const marketplace = connection.marketplaceId || ebayMarketplaceId();
  const [fulfillment, payment, returns] = await Promise.all([
    sellFetch(`/sell/account/v1/fulfillment_policy?marketplace_id=${marketplace}`, { method: "GET", token }),
    sellFetch(`/sell/account/v1/payment_policy?marketplace_id=${marketplace}`, { method: "GET", token }),
    sellFetch(`/sell/account/v1/return_policy?marketplace_id=${marketplace}`, { method: "GET", token }),
  ]);
  const next: EbayConnection = {
    ...connection,
    fulfillmentPolicyId:
      connection.fulfillmentPolicyId || firstPolicyId(fulfillment.json, "fulfillmentPolicies"),
    paymentPolicyId: connection.paymentPolicyId || firstPolicyId(payment.json, "paymentPolicies"),
    returnPolicyId: connection.returnPolicyId || firstPolicyId(returns.json, "returnPolicies"),
  };
  await writeEbayConnection(next);
  return next;
}

export async function ensureMerchantLocation(token: string) {
  const existing = await sellFetch(`/sell/inventory/v1/location/${EBAY_LOCATION_KEY}`, {
    method: "GET",
    token,
  });
  if (existing.ok) return EBAY_LOCATION_KEY;
  const created = await sellFetch(`/sell/inventory/v1/location/${EBAY_LOCATION_KEY}`, {
    method: "POST",
    token,
    body: JSON.stringify({
      name: SITE.name,
      merchantLocationStatus: "ENABLED",
      locationTypes: ["WAREHOUSE"],
      location: {
        address: {
          addressLine1: SITE.addressLine,
          city: "Airdrie",
          stateOrProvince: "AB",
          postalCode: "T4B 0J6",
          country: "CA",
        },
      },
    }),
  });
  if (!created.ok && created.status !== 409) {
    throw new Error(
      String(created.json.errors ? JSON.stringify(created.json.errors).slice(0, 280) : created.json.message || "Could not create eBay warehouse location."),
    );
  }
  return EBAY_LOCATION_KEY;
}

export async function suggestEbayCategory(token: string, query: string) {
  const tree = await sellFetch(
    `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${ebayMarketplaceId()}`,
    { method: "GET", token },
  );
  const treeId = String(tree.json.categoryTreeId || "2");
  const suggested = await sellFetch(
    `/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${encodeURIComponent(query.slice(0, 80))}`,
    { method: "GET", token },
  );
  const groups = suggested.json.categorySuggestions;
  if (!Array.isArray(groups) || groups.length === 0) return "1";
  const first = groups[0] as { category?: { categoryId?: string } };
  return first.category?.categoryId || "1";
}

export function escapeEbayHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function putInventoryItem(
  token: string,
  sku: string,
  body: Record<string, unknown>,
) {
  const result = await sellFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: "PUT",
    token,
    body: JSON.stringify(body),
  });
  if (!result.ok) {
    throw new Error(ebayErrorMessage(result.json, "Could not save the eBay inventory item."));
  }
}

export async function createOrUpdateOffer(
  token: string,
  offerId: string | null,
  body: Record<string, unknown>,
) {
  if (offerId) {
    const updated = await sellFetch(`/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, {
      method: "PUT",
      token,
      body: JSON.stringify(body),
    });
    if (!updated.ok) throw new Error(ebayErrorMessage(updated.json, "Could not update the eBay offer."));
    return offerId;
  }
  const created = await sellFetch(`/sell/inventory/v1/offer`, {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
  if (!created.ok) throw new Error(ebayErrorMessage(created.json, "Could not create the eBay offer."));
  return String(created.json.offerId || "");
}

export async function publishOffer(token: string, offerId: string) {
  const result = await sellFetch(`/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`, {
    method: "POST",
    token,
  });
  if (!result.ok) throw new Error(ebayErrorMessage(result.json, "eBay refused to publish the listing."));
  return {
    listingId: String(result.json.listingId || ""),
    offerId,
  };
}

export async function sellerSession() {
  const live = await liveEbayAccessToken();
  if (!live) return null;
  const withPolicies = await hydrateSellerPolicies(live.connection, live.token).catch(() => live.connection);
  return { token: live.token, connection: withPolicies };
}

function ebayErrorMessage(json: EbayJson, fallback: string) {
  const errors = json.errors;
  if (Array.isArray(errors) && errors[0] && typeof errors[0] === "object") {
    const first = errors[0] as { message?: string; longMessage?: string };
    return first.longMessage || first.message || fallback;
  }
  if (typeof json.message === "string" && json.message.trim()) return json.message;
  return fallback;
}
