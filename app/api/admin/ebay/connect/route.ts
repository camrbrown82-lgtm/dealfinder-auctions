import { NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { ebayConfigured } from "@/lib/ebay/config";
import { EBAY_OAUTH_COOKIE, ebayAuthorizeUrl, signOauthState } from "@/lib/ebay/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!isAdminSession()) return unauthorized();
  if (!ebayConfigured()) {
    return NextResponse.json(
      {
        error:
          "Add EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, and EBAY_RU_NAME in Vercel (or .env.local), then connect once.",
      },
      { status: 400 },
    );
  }
  const state = signOauthState();
  const response = NextResponse.redirect(ebayAuthorizeUrl(state));
  response.cookies.set(EBAY_OAUTH_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
