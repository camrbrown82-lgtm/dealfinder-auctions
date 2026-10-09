import { publicAppUrl } from "@/lib/appUrl";

export type EbayEnv = "sandbox" | "production";

export function ebayEnv(): EbayEnv {
  const raw = (process.env.EBAY_ENV || process.env.EBAY_ENVIRONMENT || "sandbox").trim().toLowerCase();
  return raw === "production" || raw === "prod" ? "production" : "sandbox";
}

export function ebayMarketplaceId() {
  const raw = (process.env.EBAY_MARKETPLACE_ID || "EBAY_CA").trim().toUpperCase();
  return raw || "EBAY_CA";
}

export function ebayClientId() {
  return (process.env.EBAY_CLIENT_ID || "").trim();
}

export function ebayClientSecret() {
  return (process.env.EBAY_CLIENT_SECRET || "").trim();
}

export function ebayRuName() {
  const named = (process.env.EBAY_RU_NAME || process.env.EBAY_REDIRECT_URI || "").trim();
  if (named) return named;
  return `${publicAppUrl()}/api/admin/ebay/callback`;
}

export function ebayConfigured() {
  return Boolean(ebayClientId() && ebayClientSecret());
}

export function ebayApiHost() {
  return ebayEnv() === "production" ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
}

export function ebayAuthHost() {
  return ebayEnv() === "production" ? "https://auth.ebay.com" : "https://auth.sandbox.ebay.com";
}

export function ebayCurrency() {
  return ebayMarketplaceId() === "EBAY_US" ? "USD" : "CAD";
}

export const EBAY_USER_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
];

export const EBAY_APP_SCOPES = ["https://api.ebay.com/oauth/api_scope"];
export const EBAY_INSIGHTS_SCOPES = ["https://api.ebay.com/oauth/api_scope/buy.marketplace.insights"];

export const EBAY_LOCATION_KEY = "dealfinder-airdrie";
