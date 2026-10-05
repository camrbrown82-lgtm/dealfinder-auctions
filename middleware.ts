import { NextResponse, type NextRequest } from "next/server";

/**
 * API responses are per paddle. Next was labelling them `public`, which lets a
 * browser or any shared proxy keep one bidder's invoices and hand them to the
 * next person through the same cache — a bidder saw lots they never bid on.
 * Nothing under /api may be stored or shared, and anything that slips past this
 * still has to vary on the session cookie.
 */
export function middleware(_request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("CDN-Cache-Control", "private, no-store");
  response.headers.set("Vercel-CDN-Cache-Control", "private, no-store");
  const vary = response.headers.get("Vary");
  if (!vary) {
    response.headers.set("Vary", "Cookie");
  } else if (!/\bcookie\b/i.test(vary)) {
    response.headers.set("Vary", `${vary}, Cookie`);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
