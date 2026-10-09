import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { ebayMarketplaceId } from "@/lib/ebay/config";
import { EBAY_OAUTH_COOKIE, exchangeAuthorizationCode, oauthStateValid } from "@/lib/ebay/oauth";
import { hydrateSellerPolicies } from "@/lib/ebay/sell";
import { writeEbayConnection } from "@/lib/ebay/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bounce(request: NextRequest, query: string) {
  return NextResponse.redirect(`${request.nextUrl.origin}/admin/buy-now?${query}`);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const ebayError = url.searchParams.get("error");
  const cookie = request.cookies.get(EBAY_OAUTH_COOKIE)?.value;
  if (!isAdminSession()) return bounce(request, "ebay=login");
  if (ebayError) return bounce(request, "ebay=denied");
  if (!code || !oauthStateValid(state) || state !== cookie) return bounce(request, "ebay=state");

  try {
    const tokens = await exchangeAuthorizationCode(code);
    const connection = await writeEbayConnection({
      ebayUserId: null,
      ebayUsername: "DealFinder eBay seller",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiresAt: new Date(tokens.expiresAt).toISOString(),
      marketplaceId: ebayMarketplaceId(),
      merchantLocationKey: null,
      fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID?.trim() || null,
      paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID?.trim() || null,
      returnPolicyId: process.env.EBAY_RETURN_POLICY_ID?.trim() || null,
      connectedAt: new Date().toISOString(),
    });
    await hydrateSellerPolicies(connection, tokens.accessToken).catch(() => connection);
    const response = bounce(request, "ebay=connected");
    response.cookies.set(EBAY_OAUTH_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "oauth";
    return bounce(request, `ebay=error&detail=${encodeURIComponent(message.slice(0, 120))}`);
  }
}
