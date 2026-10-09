import { NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { clearEbayConnection } from "@/lib/ebay/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  if (!isAdminSession()) return unauthorized();
  await clearEbayConnection();
  return NextResponse.json({ ok: true });
}
