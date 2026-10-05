import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { sendSundayBidReminders } from "@/lib/sundayBidReminder";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await sendSundayBidReminders();
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
