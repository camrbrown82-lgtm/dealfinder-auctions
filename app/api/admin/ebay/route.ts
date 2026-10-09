import { NextRequest, NextResponse } from "next/server";
import { isAdminSession, unauthorized } from "@/lib/adminAuth";
import { ebayConfigured, ebayEnv, ebayMarketplaceId } from "@/lib/ebay/config";
import { connectionPublicStatus, readEbayConnection } from "@/lib/ebay/store";
import { listLotOnEbay } from "@/lib/ebay/listLot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  if (!isAdminSession()) return unauthorized();
  const connection = await readEbayConnection();
  const publicStatus = connectionPublicStatus(connection);
  return NextResponse.json({
    configured: ebayConfigured(),
    env: ebayEnv(),
    mockMode: !ebayConfigured(),
    ...publicStatus,
    marketplaceId: publicStatus.marketplaceId || ebayMarketplaceId(),
  });
}

export async function POST(request: NextRequest) {
  if (!isAdminSession()) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { lotId?: string };
  const lotId = String(body.lotId ?? "").trim();
  if (!lotId) return NextResponse.json({ error: "lotId is required." }, { status: 400 });
  try {
    const result = await listLotOnEbay(lotId);
    return NextResponse.json(result);
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = error instanceof Error ? error.message : "Could not list on eBay.";
    if (code === "needs_connect") {
      return NextResponse.json({ error: message, connectUrl: "/api/admin/ebay/connect" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
