import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, adminPassword, adminSessionToken } from "@/lib/adminAuth";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { password?: string };
  const offered = Buffer.from(String(body.password ?? ""));
  const expected = Buffer.from(adminPassword());
  const ok =
    offered.length === expected.length && timingSafeEqual(offered, expected);

  if (!ok) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  cookies().set(ADMIN_COOKIE, adminSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  cookies().delete(ADMIN_COOKIE);
  return NextResponse.json({ ok: true });
}
