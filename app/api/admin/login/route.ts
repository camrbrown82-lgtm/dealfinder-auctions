import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminPassword,
  adminSessionEmail,
  adminSessionValue,
  isStaffEmail,
  unauthorized,
} from "@/lib/adminAuth";
import { confirmStaffAuthEmail } from "@/lib/authEmail";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const email = adminSessionEmail();
  if (!email) return unauthorized();
  const response = NextResponse.json({ ok: true, email });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

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

  await confirmStaffAuthEmail(email);
  const response = NextResponse.json({ ok: true, email });
  // Per-staff cookie. Another admin can be signed in on a different browser at
  // the same time — this does not replace their session.
  response.cookies.set(ADMIN_COOKIE, adminSessionValue(email), cookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
