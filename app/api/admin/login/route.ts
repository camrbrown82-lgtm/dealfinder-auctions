import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminPassword, adminSessionToken, isAdminSession, unauthorized } from "@/lib/adminAuth";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!isAdminSession()) return unauthorized();
  return NextResponse.json({ ok: true });
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 12,
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { password?: string };
  const offered = Buffer.from(String(body.password ?? "").trim());
  const expected = Buffer.from(adminPassword());
  const ok =
    offered.length === expected.length && timingSafeEqual(offered, expected);

  if (!ok) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, adminSessionToken(), cookieOptions);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
