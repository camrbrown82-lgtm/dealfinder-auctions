import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { runSundayPreauthSweep, sweepIp } from "@/lib/sundayPreauth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await runSundayPreauthSweep(sweepIp(request));
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
