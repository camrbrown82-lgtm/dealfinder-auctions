import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  adminPassword,
  adminSessionEmail,
  adminSessionValue,
  bidderSignedIn,
  clearAdminCookie,
  isStaffEmail,
  unauthorized,
} from "@/lib/adminAuth";
import { confirmStaffAuthEmail } from "@/lib/authEmail";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paddleBlock = {
  error:
    "This browser is signed in as a bidder. Log out of that account before opening the desk. Customer and staff logins stay separate.",
};

export async function GET() {
  if (bidderSignedIn()) {
    const response = NextResponse.json(paddleBlock, { status: 401 });
    clearAdminCookie(response);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const email = adminSessionEmail();
  if (!email) return unauthorized();
  const response = NextResponse.json({ ok: true, email });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string; password?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isStaffEmail(email)) {
    return NextResponse.json(
      { error: "Use a DealFinder staff email. Personal bidder accounts stay off this desk." },
      { status: 401 },
    );
  }
  const offered = Buffer.from(String(body.password ?? "").trim());
  const expected = Buffer.from(adminPassword());
  const ok = offered.length === expected.length && timingSafeEqual(offered, expected);
  if (!ok) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  if (bidderSignedIn()) {
    const response = NextResponse.json(paddleBlock, { status: 403 });
    clearAdminCookie(response);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  await confirmStaffAuthEmail(email);
  const response = NextResponse.json({ ok: true, email });
  response.cookies.set(ADMIN_COOKIE, adminSessionValue(email), adminCookieOptions());
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAdminCookie(response);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
