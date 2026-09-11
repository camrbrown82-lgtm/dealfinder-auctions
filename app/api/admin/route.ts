import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/session";
import {
  adminSnapshot,
  createEvent,
  createLot,
  seedHouseLots,
  updateEvent,
  updateLot,
} from "@/lib/store";
import type { Category } from "@/lib/types";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  return NextResponse.json(await adminSnapshot());
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    switch (body.action) {
      case "createLot": {
        const lot = await createLot({
          title: String(body.title || ""),
          consignor: String(body.consignor || "House stock"),
          description: String(body.description || ""),
          category: (body.category as Category) || "Oddities",
          lotNumber: body.lotNumber,
          auctionId: body.auctionId,
          startingBid: Number(body.startingBid || 0),
          reserve: Number(body.reserve || 0),
          estimatedValue: Number(body.estimatedValue || 0),
          commissionRate: Number(body.commissionRate || 0.2),
          images: Array.isArray(body.images) ? body.images : [],
          goLive: Boolean(body.goLive),
          minIncrement: Number(body.minIncrement || 10),
        });
        return NextResponse.json({ lot });
      }
      case "approve":
        await updateLot(String(body.id), { status: "live", pipelineStatus: "live" });
        return NextResponse.json({ ok: true });
      case "reject":
        await updateLot(String(body.id), { status: "removed", pipelineStatus: "removed" });
        return NextResponse.json({ ok: true });
      case "goLive":
        await updateLot(String(body.id), { status: "live", pipelineStatus: "live" });
        return NextResponse.json({ ok: true });
      case "remove":
        await updateLot(String(body.id), { status: "removed" });
        return NextResponse.json({ ok: true });
      case "assignEvent":
        await updateLot(String(body.id), { auctionId: String(body.auctionId) });
        return NextResponse.json({ ok: true });
      case "seed": {
        const added = await seedHouseLots(Number(body.count || 8));
        return NextResponse.json({ added });
      }
      case "createEvent": {
        const event = await createEvent({
          name: String(body.name || ""),
          auctionNumber: String(body.auctionNumber || ""),
          startsAt: String(body.startsAt),
          endsAt: String(body.endsAt),
        });
        return NextResponse.json({ event });
      }
      case "updateEvent": {
        const event = await updateEvent(String(body.id), body);
        return NextResponse.json({ event });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed" }, { status: 400 });
  }
}
