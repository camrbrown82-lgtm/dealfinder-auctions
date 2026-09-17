import { NextResponse } from "next/server";
import { liveFloorPayload } from "@/lib/lots";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const payload = await liveFloorPayload();
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
